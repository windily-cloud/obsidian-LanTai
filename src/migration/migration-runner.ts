import { noopAsync } from 'obsidian-dev-utils/function';

import type { ActionResult } from '../actions/action-result.ts';
import type {
	LocalImageRewriteTarget,
	LocalImageUploadService
} from '../actions/local-image-upload-service.ts';
import type { UploadWriteMode } from '../actions/upload-action.ts';
import type { NoteContent } from '../adapters/obsidian/note-content.obsidian.ts';
import type { VaultBinary } from '../adapters/obsidian/vault-binary.obsidian.ts';
import type { AttachmentPathResolver } from '../path/attachment-path-resolver.ts';
import type { PluginSettings } from '../settings/plugin-settings.ts';
import type {
	PreparedUploadSession,
	UploadSessionFailure
} from '../storage/prepare-upload-session.ts';
import type { UploadHistoryEntry } from '../storage/upload-history.ts';
import type { MigrationPlanStore } from './migration-plan-store.ts';
import type {
	MigrationItem,
	MigrationPlan,
	MigrationRef
} from './migration-plan.ts';

import { t } from '../i18n/index.ts';
import { createImageTemplateContext } from '../path/image-template-context.ts';
import { classifyUploadConflict } from '../storage/classify-upload-conflict.ts';
import {
	migrationAllDone,
	refreshMigrationStats
} from './migration-plan.ts';
import {
	isThrottledStorageError,
	MIGRATION_THROTTLE_MAX_RETRIES,
	MigrationUploadPacer,
	throttleRetryAfterMs
} from './migration-upload-pacer.ts';

/** 批量迁移默认同时处理的文件数。上传是网络 IO，串行时总耗时约等于 文件数 × RTT。 */
export const MIGRATION_DEFAULT_CONCURRENCY = 4;
export const MIGRATION_MAX_CONCURRENCY = 16;
/**
 * 迁移计划可能包含数千条引用，JSON 体积可达数 MB。
 * 每处理一个文件就整份落盘会把迁移拖慢，因此按最小间隔节流。
 */
const MIGRATION_SAVE_INTERVAL_MS = 2_000;

const RESOLVED: Promise<unknown> = noopAsync();

/** 待处理的迁移任务队列，由多个 worker 竞争取用。 */
interface MigrationQueue {
	cursor: number;
	readonly items: readonly MigrationItem[];
	paused: boolean;
}

interface MigrationRunnerConstructorParams {
	readonly concurrency?: number | undefined;
	hasLocalReference(localPath: string): Promise<boolean>;
	openNote(notePath: string): Promise<NoteContent | null>;
	readonly pacer?: MigrationUploadPacer;
	readonly pathResolver: AttachmentPathResolver;
	prepareSession(): Promise<PreparedUploadSession | UploadSessionFailure>;
	recordUpload(entry: UploadHistoryEntry): Promise<void>;
	readonly settings: PluginSettings;
	readonly store: MigrationPlanStore;
	readonly upload: LocalImageUploadService;
	readonly vault: VaultBinary;
}

interface MigrationRunnerProgress {
	readonly currentPath: string;
	readonly done: number;
	readonly total: number;
}

interface RunMigrationInput {
	onProgress?(progress: MigrationRunnerProgress): void;
	readonly plan: MigrationPlan;
	shouldPause(): boolean;
}

interface RunnableMigrationRefs {
	readonly refs: MigrationRef[];
	readonly targets: LocalImageRewriteTarget[];
}

export class MigrationRunner {
	private readonly concurrency: number;
	private readonly hasLocalReference: MigrationRunnerConstructorParams['hasLocalReference'];
	private lastSavedAt = 0;
	private readonly noteLocks = new Map<string, Promise<unknown>>();
	private readonly openNote: MigrationRunnerConstructorParams['openNote'];
	private readonly pacer: MigrationUploadPacer;
	private readonly pathResolver: AttachmentPathResolver;
	private readonly prepareSession: MigrationRunnerConstructorParams['prepareSession'];
	private readonly recordUpload: MigrationRunnerConstructorParams['recordUpload'];
	private readonly settings: PluginSettings;
	private readonly store: MigrationPlanStore;
	private readonly upload: LocalImageUploadService;
	private readonly vault: VaultBinary;

	public constructor(params: MigrationRunnerConstructorParams) {
		this.concurrency = clampConcurrency(params.concurrency);
		this.hasLocalReference = (localPath): Promise<boolean> => params.hasLocalReference(localPath);
		this.openNote = (notePath): Promise<NoteContent | null> => params.openNote(notePath);
		this.pathResolver = params.pathResolver;
		this.pacer = params.pacer ?? new MigrationUploadPacer();
		this.prepareSession = (): ReturnType<MigrationRunnerConstructorParams['prepareSession']> => params.prepareSession();
		this.recordUpload = (entry): Promise<void> => params.recordUpload(entry);
		this.settings = params.settings;
		this.store = params.store;
		this.upload = params.upload;
		this.vault = params.vault;
	}

	public async run(input: RunMigrationInput): Promise<MigrationPlan> {
		const plan = input.plan;
		plan.status = 'running';
		plan.updatedAt = Date.now();
		await this.store.save(plan);

		const prepared = await this.prepareSession();
		if (!prepared.ok) {
			for (const item of plan.items) {
				if (item.status !== 'done') {
					item.status = 'failed';
					item.error = uploadSessionErrorMessage(prepared);
				}
			}
			refreshMigrationStats(plan);
			plan.status = 'paused';
			plan.updatedAt = Date.now();
			await this.store.save(plan);
			return plan;
		}

		const notes = new Map<string, NoteContent>();
		const queue: MigrationQueue = {
			cursor: 0,
			items: plan.items.filter((item) => item.status !== 'done'),
			paused: false
		};

		const workers: Promise<void>[] = [];
		const workerCount = Math.max(1, Math.min(this.concurrency, queue.items.length));
		for (let index = 0; index < workerCount; index += 1) {
			workers.push(this.runQueue(plan, queue, prepared, notes, input));
		}
		await Promise.all(workers);

		refreshMigrationStats(plan);
		await this.persist(plan, true);

		if (!queue.paused && migrationAllDone(plan)) {
			plan.status = 'completed';
			plan.updatedAt = Date.now();
			await this.store.delete();
			return plan;
		}
		plan.status = 'paused';
		plan.updatedAt = Date.now();
		await this.store.save(plan);
		return plan;
	}

	private async classifyWriteMode(
		item: MigrationItem,
		pendingRefs: readonly MigrationRef[],
		prepared: PreparedUploadSession
	): Promise<null | UploadWriteMode> {
		const noteFilePath = pendingRefs[0]?.notePath ?? '';
		const ctx = createImageTemplateContext(item.localPath, noteFilePath);
		const localBytes = await this.vault.readBinary(item.localPath);
		const objectKey = this.pathResolver.resolveObjectKey({
			ctx,
			template: prepared.profile.objectKeyTemplate
		});
		const classification = await classifyUploadConflict({
			localBytes,
			objectKey,
			storage: prepared.storage
		});
		if (classification === 'different') {
			failItem(item, pendingRefs, t('migration.objectKeyConflict'));
			return null;
		}
		return classification === 'same' ? 'linkOnly' : 'upload';
	}

	private async collectRunnableRefs(
		pendingRefs: readonly MigrationRef[],
		notes: Map<string, NoteContent>
	): Promise<RunnableMigrationRefs> {
		const refs: MigrationRef[] = [];
		const targets: LocalImageRewriteTarget[] = [];
		for (const ref of pendingRefs) {
			let note = notes.get(ref.notePath);
			if (note === undefined) {
				const opened = await this.openNote(ref.notePath);
				if (opened === null) {
					ref.status = 'failed';
					ref.error = t('errors.vaultFileNotFound', { path: ref.notePath });
					continue;
				}
				note = opened;
				notes.set(ref.notePath, note);
			}
			refs.push(ref);
			targets.push({
				note,
				noteFilePath: ref.notePath,
				source: ref.source
			});
		}
		return { refs, targets };
	}

	private async persist(plan: MigrationPlan, force = false): Promise<void> {
		plan.updatedAt = Date.now();
		const now = Date.now();
		if (!force && now - this.lastSavedAt < MIGRATION_SAVE_INTERVAL_MS) {
			return;
		}
		this.lastSavedAt = now;
		await this.store.save(plan);
	}

	private async runItem(
		plan: MigrationPlan,
		item: MigrationItem,
		prepared: PreparedUploadSession,
		notes: Map<string, NoteContent>
	): Promise<void> {
		const pendingRefs = item.refs.filter((ref) => ref.status !== 'done');
		if (pendingRefs.length === 0) {
			markItemDone(item);
			return;
		}

		if (item.localPath.startsWith('unresolved:') || !(await this.vault.exists(item.localPath))) {
			failItem(item, pendingRefs, t('errors.localImageNotFound'));
			return;
		}

		const knownUpload = item.uploadedKey && item.uploadedUrl
			? { key: item.uploadedKey, url: item.uploadedUrl }
			: undefined;
		const writeMode = knownUpload
			? 'linkOnly'
			: await this.classifyWriteMode(item, pendingRefs, prepared);
		if (writeMode === null) {
			return;
		}

		const collected = await this.collectRunnableRefs(pendingRefs, notes);
		if (collected.targets.length === 0) {
			markItemFailed(item, t('errors.imageActionFailed'));
			return;
		}

		const result = await this.upload.uploadUniqueFile({
			deleteSourceAfterUpload: plan.deleteSourceAfterUpload,
			hasRemainingReference: (): Promise<boolean> => this.hasLocalReference(item.localPath),
			...(knownUpload === undefined ? {} : { knownUpload }),
			linkStyle: this.settings.linkStyle,
			localPath: item.localPath,
			objectKeyTemplate: prepared.profile.objectKeyTemplate,
			onUploaded: async (info): Promise<void> => {
				markItemUploaded(item, info.key, info.url);
				await this.persist(plan, true);
			},
			profileId: prepared.profile.id,
			recordUpload: (entry): Promise<void> => this.recordUpload(entry),
			storage: prepared.storage,
			targets: collected.targets,
			vault: this.vault,
			writeMode
		});

		if (result.key && result.url) {
			markItemUploaded(item, result.key, result.url);
		}
		applyRefResults(collected.refs, result.results);
		if (item.refs.every((ref) => ref.status === 'done')) {
			markItemDone(item);
			return;
		}
		markItemFailed(
			item,
			item.refs.find((ref) => ref.status === 'failed')?.error ?? t('errors.imageActionFailed')
		);
	}

	/**
	 * 同一篇笔记的改写必须串行：并发改写会让两边读到不同的内容快照而互相覆盖。
	 * 不同笔记之间没有共享状态，可以放心并发。
	 */
	private async runItemWithNoteLock(
		plan: MigrationPlan,
		item: MigrationItem,
		prepared: PreparedUploadSession,
		notes: Map<string, NoteContent>
	): Promise<void> {
		const notePaths = item.refs.map((ref) => ref.notePath);
		await this.withNoteLocks(notePaths, () => this.runItemWithRetries(plan, item, prepared, notes));
	}

	private async runItemWithRetries(
		plan: MigrationPlan,
		item: MigrationItem,
		prepared: PreparedUploadSession,
		notes: Map<string, NoteContent>
	): Promise<void> {
		const needsNetwork = !(item.uploadedKey && item.uploadedUrl);
		for (let attempt = 0; attempt <= MIGRATION_THROTTLE_MAX_RETRIES; attempt += 1) {
			if (needsNetwork) {
				await this.pacer.waitTurn();
			}
			try {
				await this.runItem(plan, item, prepared, notes);
				return;
			} catch (error) {
				const pendingRefs = item.refs.filter((ref) => ref.status !== 'done');
				if (
					!isThrottledStorageError(error)
					|| attempt === MIGRATION_THROTTLE_MAX_RETRIES
				) {
					failItem(
						item,
						pendingRefs,
						error instanceof Error ? error.message : t('errors.imageActionFailed')
					);
					return;
				}
				await this.pacer.waitRetry(attempt, throttleRetryAfterMs(error));
			}
		}
	}

	private async runQueue(
		plan: MigrationPlan,
		queue: MigrationQueue,
		prepared: PreparedUploadSession,
		notes: Map<string, NoteContent>,
		input: RunMigrationInput
	): Promise<void> {
		for (;;) {
			if (input.shouldPause()) {
				queue.paused = true;
				return;
			}
			const item = takeNextItem(queue);
			if (!item) {
				return;
			}
			input.onProgress?.({
				currentPath: item.localPath,
				done: plan.stats.doneCount,
				total: plan.items.length
			});
			await this.runItemWithNoteLock(plan, item, prepared, notes);
			refreshMigrationStats(plan);
			await this.persist(plan);
		}
	}

	private async withNoteLocks<T>(
		notePaths: readonly string[],
		task: () => Promise<T>
	): Promise<T> {
		const keys = [...new Set(notePaths)];
		if (keys.length === 0) {
			return task();
		}
		const gates = keys.map((key) => this.noteLocks.get(key) ?? RESOLVED);
		const run = Promise.all(gates).then(task, task);
		const marker = run.then(
			(): void => undefined,
			(): void => undefined
		);
		for (const key of keys) {
			this.noteLocks.set(key, marker);
		}
		return run;
	}
}

function applyRefResults(
	refs: readonly MigrationRef[],
	results: readonly ActionResult[]
): void {
	for (const [index, ref] of refs.entries()) {
		const refResult = results[index];
		if (refResult?.ok === true) {
			ref.status = 'done';
			delete ref.error;
			continue;
		}
		ref.status = 'failed';
		ref.error = refResult?.ok === false
			? (refResult.message ?? t('errors.imageActionFailed'))
			: t('errors.imageActionFailed');
	}
}

function clampConcurrency(value: number | undefined): number {
	if (value === undefined || !Number.isFinite(value)) {
		return MIGRATION_DEFAULT_CONCURRENCY;
	}
	return Math.min(MIGRATION_MAX_CONCURRENCY, Math.max(1, Math.floor(value)));
}

function failItem(
	item: MigrationItem,
	pendingRefs: readonly MigrationRef[],
	message: string
): void {
	markItemFailed(item, message);
	for (const ref of pendingRefs) {
		ref.status = 'failed';
		ref.error = message;
	}
}

function markItemDone(item: MigrationItem): void {
	item.status = 'done';
	delete item.error;
}

function markItemFailed(item: MigrationItem, message: string): void {
	item.status = 'failed';
	item.error = message;
}

function markItemUploaded(item: MigrationItem, key: string, url: string): void {
	item.uploadedKey = key;
	item.uploadedUrl = url;
	item.status = 'uploaded';
}

function takeNextItem(queue: MigrationQueue): MigrationItem | undefined {
	if (queue.paused) {
		return undefined;
	}
	const item = queue.items.at(queue.cursor);
	queue.cursor += 1;
	return item;
}

function uploadSessionErrorMessage(failure: UploadSessionFailure): string {
	const result = failure.result;
	if (!result.ok) {
		return result.message ?? t('errors.imageActionFailed');
	}
	return t('errors.imageActionFailed');
}
