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
import type { StorageSecrets } from '../storage/storage-secrets.ts';
import type { UploadHistoryEntry } from '../storage/upload-history.ts';
import type { ActionResult } from './action-result.ts';
import type { DownloadAction } from './download-action.ts';
import type { LocalizeAction } from './localize-action.ts';
import type {
	UploadAction,
	UploadWriteMode
} from './upload-action.ts';
import type { ConfirmOverwrite } from './upload-conflict-coordinator.ts';

import { t } from '../i18n/index.ts';
import { buildNameTemplateContext } from '../path/name-template-context.ts';
import { classifyUploadConflict } from '../storage/classify-upload-conflict.ts';
import { validateStorageSecrets } from '../storage/storage-credential-guard.ts';
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
	context: ImageActionContext
) => Promise<boolean>;

interface ImageActionFacadeConstructorParams {
	readonly confirmOverwrite: ConfirmOverwrite;
	readonly createStorage: CreateObjectStorage;
	readonly download: BrowserDownload;
	readonly downloadAction: DownloadAction;
	readonly getSecret: GetSecret;
	readonly hasLocalReference: HasLocalReference;
	readonly http: HttpFetch;
	readonly localizeAction: LocalizeAction;
	readonly parser: ImageLinkParser;
	readonly pathResolver: AttachmentPathResolver;
	recordUpload(entry: UploadHistoryEntry): Promise<void>;
	readonly resolveVaultPath: ResolveVaultPath;
	readonly settings: PluginSettings;
	readonly uploadAction: UploadAction;
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

interface PreparedUploadSession {
	readonly ok: true;
	readonly profile: StorageProfile;
	readonly storage: ObjectStorage;
}

interface ReadyUploadResult {
	readonly kind: 'ready-result';
	readonly result: ActionResult;
}

type ResolveVaultPath = (target: string, noteFilePath: string) => null | string;

interface UploadSessionFailure {
	readonly ok: false;
	readonly result: ActionResult;
}

export class ImageActionFacade {
	private readonly confirmOverwrite: ConfirmOverwrite;
	private readonly createStorage: ImageActionFacadeConstructorParams['createStorage'];
	private readonly download: BrowserDownload;
	private readonly downloadAction: DownloadAction;
	private readonly getSecret: ImageActionFacadeConstructorParams['getSecret'];
	private readonly hasLocalReference: HasLocalReference;
	private readonly http: HttpFetch;
	private readonly localizeAction: LocalizeAction;
	private readonly parser: ImageLinkParser;
	private readonly pathResolver: AttachmentPathResolver;
	private readonly recordUpload: ImageActionFacadeConstructorParams['recordUpload'];
	private readonly resolveVaultPath: ImageActionFacadeConstructorParams['resolveVaultPath'];
	private readonly settings: PluginSettings;
	private readonly uploadAction: UploadAction;
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
		this.localizeAction = params.localizeAction;
		this.parser = params.parser;
		this.pathResolver = params.pathResolver;
		this.resolveVaultPath = params.resolveVaultPath;
		this.settings = params.settings;
		this.uploadAction = params.uploadAction;
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
		const ctx = createTemplateContext(ref.target, context.noteFilePath);
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
			const ctx = createTemplateContext(ref.target, context.noteFilePath);
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
				results.push(await this.executePreparedUpload(item, prepared, context, mode));
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
		const ctx = createTemplateContext(ref.target, context.noteFilePath);
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
			mode
		);
	}

	private async executePreparedUpload(
		item: PendingUploadItem,
		prepared: PreparedUploadSession,
		context: ImageActionContext,
		writeMode: UploadWriteMode
	): Promise<ActionResult> {
		return this.uploadAction.execute({
			ctx: item.ctx,
			deleteSourceAfterUpload: this.settings.deleteSourceAfterUpload,
			hasRemainingReference: (): Promise<boolean> => this.hasRemainingLocalReference(item.localPath, context),
			linkStyle: this.settings.linkStyle,
			localPath: item.localPath,
			note: context.note,
			noteFolderPath: item.ctx.noteFolderPath,
			objectKeyTemplate: prepared.profile.objectKeyTemplate,
			profileId: prepared.profile.id,
			recordUpload: (entry): Promise<void> => this.recordUpload(entry),
			ref: item.ref,
			storage: prepared.storage,
			vault: this.vault,
			writeMode
		});
	}

	private async hasRemainingLocalReference(
		localPath: string,
		context: ImageActionContext
	): Promise<boolean> {
		return this.hasLocalReference(localPath, context);
	}

	private async prepareUploadSession(): Promise<PreparedUploadSession | UploadSessionFailure> {
		const profile = this.settings.profiles.find(
			(item) => item.id === this.settings.activeProfileId
		);
		if (!profile) {
			return {
				ok: false,
				result: {
					message: t('errors.noActiveStorageProfile'),
					ok: false,
					reason: 'missing'
				}
			};
		}
		if (!profile.publicBaseUrl.trim()) {
			return {
				ok: false,
				result: {
					message: t('errors.publicBaseUrlRequired'),
					ok: false,
					reason: 'missing'
				}
			};
		}
		const accessKeyId = this.getSecret(profile.accessKeyIdSecretName);
		const secretAccessKey = this.getSecret(profile.secretAccessKeySecretName);
		if (!accessKeyId || !secretAccessKey) {
			return {
				ok: false,
				result: {
					message: t('errors.storageSecretsMissing'),
					ok: false,
					reason: 'missing'
				}
			};
		}
		const secretProblem = validateStorageSecrets({
			accessKeyId,
			accessKeyIdSecretName: profile.accessKeyIdSecretName,
			secretAccessKey,
			secretAccessKeySecretName: profile.secretAccessKeySecretName
		});
		if (secretProblem) {
			return {
				ok: false,
				result: { message: secretProblem, ok: false, reason: 'missing' }
			};
		}
		const storage = await this.createStorage(profile, {
			accessKeyId,
			secretAccessKey
		});
		return { ok: true, profile, storage };
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

function actionErrorResult(error: unknown): ActionResult {
	return {
		message: error instanceof Error ? error.message : t('errors.imageActionFailed'),
		ok: false,
		reason: 'error'
	};
}

function createTemplateContext(
	imageTarget: string,
	noteFilePathWithExtension: string
): NameTemplateContext {
	const fileName = imageFileName(imageTarget);
	const extensionIndex = fileName.lastIndexOf('.');
	return buildNameTemplateContext({
		ext: extensionIndex > 0 ? fileName.slice(extensionIndex + 1) : '',
		noteFilePath: noteFilePathWithExtension,
		originalName: extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName
	});
}

function imageFileName(target: string): string {
	const withoutQuery = target.split(/[?#]/u, 1)[0] ?? target;
	const slashIndex = withoutQuery.lastIndexOf('/');
	const encodedName = (slashIndex === -1 ? withoutQuery : withoutQuery.slice(slashIndex + 1))
		|| 'image';
	try {
		return decodeURIComponent(encodedName);
	} catch {
		return encodedName;
	}
}
