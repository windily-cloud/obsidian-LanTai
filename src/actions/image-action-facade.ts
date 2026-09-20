import type { BrowserDownload } from '../adapters/obsidian/browser-download.obsidian.ts';
import type { HttpFetch } from '../adapters/obsidian/http-fetch.obsidian.ts';
import type { NoteContent } from '../adapters/obsidian/note-content.obsidian.ts';
import type { VaultBinary } from '../adapters/obsidian/vault-binary.obsidian.ts';
import type { ImageLinkParser } from '../link/image-link-parser.ts';
import type {
	ImageRef,
	ImageTarget
} from '../link/image-ref.ts';
import type { AttachmentPathResolver } from '../path/attachment-path-resolver.ts';
import type { NameTemplateContext } from '../path/name-template-context.ts';
import type { PluginSettings } from '../settings/plugin-settings.ts';
import type { StorageProfile } from '../settings/sections/s3/storage-profile.ts';
import type { UploadConflictClass } from '../storage/classify-upload-conflict.ts';
import type { ObjectStorage } from '../storage/object-storage.ts';
import type {
	PreparedUploadSession,
	UploadSessionFailure
} from '../storage/prepare-upload-session.ts';
import type { StorageSecrets } from '../storage/storage-secrets.ts';
import type { UploadHistoryEntry } from '../storage/upload-history.ts';
import type { ActionResult } from './action-result.ts';
import type { DownloadAction } from './download-action.ts';
import type { LocalImageUploadService } from './local-image-upload-service.ts';
import type { LocalizeAction } from './localize-action.ts';
import type {
	KnownUpload,
	UploadWriteMode
} from './upload-action.ts';
import type { ConfirmOverwrite } from './upload-conflict-coordinator.ts';

import { t } from '../i18n/index.ts';
import {
	createImageTemplateContext,
	imageFileName
} from '../path/image-template-context.ts';
import { classifyUploadConflict } from '../storage/classify-upload-conflict.ts';
import {
	actionErrorResult,
	prepareUploadSession
} from '../storage/prepare-upload-session.ts';
import { coordinateUploadModes } from './upload-conflict-coordinator.ts';

export interface ImageActionContext {
	note: NoteContent;
	noteFilePath: string;
}

interface ClassifiedImageRefs {
	local: ImageRef[];
	remote: ImageRef[];
}

type CreateObjectStorage = (
	profile: StorageProfile,
	secrets: StorageSecrets
) => Promise<ObjectStorage>;

type GetSecret = (name: string) => null | string;

type HasLocalReference = (
	localPath: string,
	context: ImageActionContext,
	exclude?: ImageRef
) => Promise<boolean>;

interface ImageActionFacadeConstructorParams {
	readonly confirmOverwrite: ConfirmOverwrite;
	readonly createStorage: CreateObjectStorage;
	readonly download: BrowserDownload;
	readonly downloadAction: DownloadAction;
	readonly getSecret: GetSecret;
	readonly hasLocalReference: HasLocalReference;
	readonly http: HttpFetch;
	readonly localImageUpload: LocalImageUploadService;
	readonly localizeAction: LocalizeAction;
	readonly parser: ImageLinkParser;
	readonly pathResolver: AttachmentPathResolver;
	recordUpload(entry: UploadHistoryEntry): Promise<void>;
	readonly resolveVaultPath: ResolveVaultPath;
	readonly settings: PluginSettings;
	readonly vault: VaultBinary;
}

interface PendingUploadItem {
	readonly classification: UploadConflictClass;
	readonly ctx: NameTemplateContext;
	readonly kind: 'pending';
	readonly localPath: string;
	readonly ref: ImageRef;
}

type PreparedUploadItem = PendingUploadItem | ReadyUploadResult;

interface ReadyUploadResult {
	readonly kind: 'ready-result';
	readonly result: ActionResult;
}

type ResolveVaultPath = (target: string, noteFilePath: string) => null | string;

export class ImageActionFacade {
	private readonly confirmOverwrite: ConfirmOverwrite;
	private readonly createStorage: ImageActionFacadeConstructorParams['createStorage'];
	private readonly download: BrowserDownload;
	private readonly downloadAction: DownloadAction;
	private readonly getSecret: ImageActionFacadeConstructorParams['getSecret'];
	private readonly hasLocalReference: HasLocalReference;
	private readonly http: HttpFetch;
	private readonly localImageUpload: LocalImageUploadService;
	private readonly localizeAction: LocalizeAction;
	private readonly parser: ImageLinkParser;
	private readonly pathResolver: AttachmentPathResolver;
	private readonly recordUpload: ImageActionFacadeConstructorParams['recordUpload'];
	private readonly resolveVaultPath: ResolveVaultPath;
	private readonly settings: PluginSettings;
	private readonly vault: VaultBinary;

	public constructor(params: ImageActionFacadeConstructorParams) {
		this.confirmOverwrite = params.confirmOverwrite;
		this.createStorage = params.createStorage;
		this.recordUpload = (entry): Promise<void> => params.recordUpload(entry);
		this.download = params.download;
		this.downloadAction = params.downloadAction;
		this.getSecret = params.getSecret;
		this.http = params.http;
		this.hasLocalReference = params.hasLocalReference;
		this.localImageUpload = params.localImageUpload;
		this.localizeAction = params.localizeAction;
		this.parser = params.parser;
		this.pathResolver = params.pathResolver;
		this.resolveVaultPath = params.resolveVaultPath;
		this.settings = params.settings;
		this.vault = params.vault;
	}

	public async downloadOne(
		target: ImageTarget,
		context: ImageActionContext
	): Promise<ActionResult> {
		const fileName = imageFileName(target.target);
		const localPath = target.isRemote
			? undefined
			: (this.resolveVaultPath(target.target, context.noteFilePath)
				?? undefined);
		if (!target.isRemote && !localPath) {
			return {
				message: t('errors.localImageNotFound'),
				ok: false,
				reason: 'missing'
			};
		}
		return this.downloadAction.execute({
			defaultFileName: fileName,
			download: this.download,
			http: this.http,
			...(localPath ? { localPath } : {}),
			...(target.isRemote ? { remoteUrl: target.target } : {}),
			vault: this.vault
		});
	}

	public async localizeAllRemoteInNote(
		context: ImageActionContext
	): Promise<ActionResult[]> {
		const { remote } = classifyRefs(
			this.parser.parse(context.note.getContent())
		);
		const results: ActionResult[] = [];
		for (const ref of [...remote].reverse()) {
			try {
				results.push(await this.localizeOne(ref, context));
			} catch (error) {
				results.push(actionErrorResult(error));
			}
		}
		return results.reverse();
	}

	public async localizeOne(
		ref: ImageRef,
		context: ImageActionContext
	): Promise<ActionResult> {
		if (!ref.isRemote) {
			return {
				message: t('errors.alreadyLocal'),
				ok: false,
				reason: 'missing'
			};
		}
		const ctx = createImageTemplateContext(ref.target, context.noteFilePath);
		return this.localizeAction.execute({
			attachmentBase: this.settings.attachmentBase,
			ctx,
			http: this.http,
			linkStyle: this.settings.linkStyle,
			localPathTemplate: this.settings.localPathTemplate,
			note: context.note,
			noteFolderPath: ctx.noteFolderPath,
			ref,
			remoteUrl: ref.target,
			vault: this.vault
		});
	}

	public parseNote(context: ImageActionContext): ImageRef[] {
		return this.parser.parse(context.note.getContent());
	}

	public prepareUploadSession(): Promise<PreparedUploadSession | UploadSessionFailure> {
		return prepareUploadSession({
			createStorage: this.createStorage,
			getSecret: this.getSecret,
			settings: this.settings
		});
	}

	public async uploadAllLocalInNote(
		context: ImageActionContext
	): Promise<ActionResult[]> {
		const { local } = classifyRefs(
			this.parser.parse(context.note.getContent())
		);
		const prepared = await this.prepareUploadSession();
		if (!prepared.ok) {
			return local.map(() => prepared.result);
		}

		const items: PreparedUploadItem[] = [];
		for (const ref of local) {
			const localPath = this.resolveVaultPath(ref.target, context.noteFilePath);
			if (!localPath) {
				items.push({
					kind: 'ready-result',
					result: {
						message: t('errors.localImageNotFound'),
						ok: false,
						reason: 'missing'
					}
				});
				continue;
			}
			const ctx = createImageTemplateContext(ref.target, context.noteFilePath);
			const objectKey = this.pathResolver.resolveObjectKey({
				ctx,
				template: prepared.profile.objectKeyTemplate
			});
			const localBytes = await this.vault.readBinary(localPath);
			const classification = await classifyUploadConflict({
				localBytes,
				objectKey,
				storage: prepared.storage
			});
			items.push({
				classification,
				ctx,
				kind: 'pending',
				localPath,
				ref
			});
		}

		const pending = items.filter((item): item is PendingUploadItem => item.kind === 'pending');
		const modes = await coordinateUploadModes({
			classes: pending.map((item) => item.classification),
			confirmOverwrite: this.confirmOverwrite,
			sameMode: 'linkOnly'
		});

		const knownByPath = new Map<string, KnownUpload>();
		let pendingIndex = 0;
		const results: ActionResult[] = [];
		for (const item of [...items].reverse()) {
			if (item.kind === 'ready-result') {
				results.push(item.result);
				continue;
			}
			const mode = modes[modes.length - 1 - pendingIndex];
			pendingIndex += 1;
			if (mode === undefined || mode === 'skip') {
				results.push({ cancelled: true, ok: true });
				continue;
			}
			try {
				results.push(
					await this.executePreparedUpload(item, prepared, context, mode, knownByPath)
				);
			} catch (error) {
				results.push(actionErrorResult(error));
			}
		}
		return results.reverse();
	}

	public async uploadOne(
		ref: ImageRef,
		context: ImageActionContext
	): Promise<ActionResult> {
		if (ref.isRemote) {
			return {
				message: t('errors.alreadyRemote'),
				ok: false,
				reason: 'missing'
			};
		}
		const prepared = await this.prepareUploadSession();
		if (!prepared.ok) {
			return prepared.result;
		}
		const localPath = this.resolveVaultPath(ref.target, context.noteFilePath);
		if (!localPath) {
			return {
				message: t('errors.localImageNotFound'),
				ok: false,
				reason: 'missing'
			};
		}
		const ctx = createImageTemplateContext(ref.target, context.noteFilePath);
		const objectKey = this.pathResolver.resolveObjectKey({
			ctx,
			template: prepared.profile.objectKeyTemplate
		});
		const localBytes = await this.vault.readBinary(localPath);
		const classification = await classifyUploadConflict({
			localBytes,
			objectKey,
			storage: prepared.storage
		});
		const [mode] = await coordinateUploadModes({
			classes: [classification],
			confirmOverwrite: this.confirmOverwrite,
			sameMode: 'linkOnly'
		});
		if (mode === undefined || mode === 'skip') {
			return { cancelled: true, ok: true };
		}
		return this.executePreparedUpload(
			{ classification, ctx, kind: 'pending', localPath, ref },
			prepared,
			context,
			mode,
			new Map()
		);
	}

	private async executePreparedUpload(
		item: PendingUploadItem,
		prepared: PreparedUploadSession,
		context: ImageActionContext,
		writeMode: UploadWriteMode,
		knownByPath: Map<string, KnownUpload>
	): Promise<ActionResult> {
		const knownUpload = knownByPath.get(item.localPath);
		const uploaded = await this.localImageUpload.uploadUniqueFile({
			deleteSourceAfterUpload: this.settings.deleteSourceAfterUpload,
			hasRemainingReference: (): Promise<boolean> => this.hasLocalReference(item.localPath, context),
			...(knownUpload === undefined ? {} : { knownUpload }),
			linkStyle: this.settings.linkStyle,
			localPath: item.localPath,
			objectKeyTemplate: prepared.profile.objectKeyTemplate,
			profileId: prepared.profile.id,
			recordUpload: (entry): Promise<void> => this.recordUpload(entry),
			storage: prepared.storage,
			targets: [{
				note: context.note,
				noteFilePath: context.noteFilePath,
				source: item.ref.source
			}],
			vault: this.vault,
			writeMode: knownUpload === undefined ? writeMode : 'linkOnly'
		});
		if (uploaded.key && uploaded.url) {
			knownByPath.set(item.localPath, { key: uploaded.key, url: uploaded.url });
		}
		const first = uploaded.results[0];
		if (first !== undefined) {
			return first;
		}
		if (!uploaded.ok) {
			return { ok: false, reason: 'error' };
		}
		return {
			ok: true,
			...(uploaded.key === undefined ? {} : { key: uploaded.key }),
			...(uploaded.url === undefined ? {} : { url: uploaded.url })
		};
	}
}

/** Exposed for unit tests. */
export function classifyRefs(refs: readonly ImageRef[]): ClassifiedImageRefs {
	const local: ImageRef[] = [];
	const remote: ImageRef[] = [];
	for (const ref of refs) {
		(ref.isRemote ? remote : local).push(ref);
	}
	return { local, remote };
}
