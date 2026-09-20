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

export interface MigrationRunnerProgress {
	readonly currentPath: string;
	readonly done: number;
	readonly total: number;
}

export interface RunMigrationInput {
	onProgress?(progress: MigrationRunnerProgress): void;
	readonly plan: MigrationPlan;
	shouldPause(): boolean;
}

interface MigrationRunnerConstructorParams {
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

interface RunnableMigrationRefs {
	readonly refs: MigrationRef[];
	readonly targets: LocalImageRewriteTarget[];
}

export class MigrationRunner {
	private readonly hasLocalReference: MigrationRunnerConstructorParams['hasLocalReference'];
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
		for (const item of plan.items) {
			if (input.shouldPause()) {
				plan.status = 'paused';
				plan.updatedAt = Date.now();
				await this.store.save(plan);
				return plan;
			}
			if (item.status === 'done') {
				continue;
			}
			input.onProgress?.({
				currentPath: item.localPath,
				done: plan.stats.doneCount,
				total: plan.items.length
			});
			await this.runItemWithRetries(plan, item, prepared, notes);
			refreshMigrationStats(plan);
			plan.updatedAt = Date.now();
			await this.store.save(plan);
		}

		if (migrationAllDone(plan)) {
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
				plan.updatedAt = Date.now();
				await this.store.save(plan);
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

function uploadSessionErrorMessage(failure: UploadSessionFailure): string {
	const result = failure.result;
	if (!result.ok) {
		return result.message ?? t('errors.imageActionFailed');
	}
	return t('errors.imageActionFailed');
}
