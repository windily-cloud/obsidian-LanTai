import type { HttpFetch } from '../adapters/obsidian/http-fetch.obsidian.ts';
import type { NoteContent } from '../adapters/obsidian/note-content.obsidian.ts';
import type { SaveDialog } from '../adapters/obsidian/save-dialog.obsidian.ts';
import type { VaultBinary } from '../adapters/obsidian/vault-binary.obsidian.ts';
import type { ImageLinkParser } from '../link/image-link-parser.ts';
import type {
	ImageRef,
	ImageTarget
} from '../link/image-ref.ts';
import type { NameTemplateContext } from '../path/name-template-context.ts';
import type { PluginSettings } from '../settings/plugin-settings.ts';
import type { StorageProfile } from '../settings/sections/s3/storage-profile.ts';
import type { ObjectStorage } from '../storage/object-storage.ts';
import type { StorageSecrets } from '../storage/storage-secrets.ts';
import type { ActionResult } from './action-result.ts';
import type { DownloadAction } from './download-action.ts';
import type { LocalizeAction } from './localize-action.ts';
import type { UploadAction } from './upload-action.ts';

import { t } from '../i18n/index.ts';
import { buildNameTemplateContext } from '../path/name-template-context.ts';
import { validateStorageSecrets } from '../storage/storage-credential-guard.ts';

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
	readonly createStorage: CreateObjectStorage;
	readonly downloadAction: DownloadAction;
	readonly getSecret: GetSecret;
	readonly hasLocalReference: HasLocalReference;
	readonly http: HttpFetch;
	readonly localizeAction: LocalizeAction;
	readonly parser: ImageLinkParser;
	readonly resolveVaultPath: ResolveVaultPath;
	readonly saveDialog: SaveDialog;
	readonly settings: PluginSettings;
	readonly uploadAction: UploadAction;
	readonly vault: VaultBinary;
}

type ResolveVaultPath = (
	target: string,
	noteFilePath: string
) => null | string;

export class ImageActionFacade {
	private readonly createStorage: ImageActionFacadeConstructorParams['createStorage'];
	private readonly downloadAction: DownloadAction;
	private readonly getSecret: ImageActionFacadeConstructorParams['getSecret'];
	private readonly hasLocalReference: HasLocalReference;
	private readonly http: HttpFetch;
	private readonly localizeAction: LocalizeAction;
	private readonly parser: ImageLinkParser;
	private readonly resolveVaultPath: ImageActionFacadeConstructorParams['resolveVaultPath'];
	private readonly saveDialog: SaveDialog;
	private readonly settings: PluginSettings;
	private readonly uploadAction: UploadAction;
	private readonly vault: VaultBinary;

	public constructor(params: ImageActionFacadeConstructorParams) {
		this.createStorage = params.createStorage;
		this.downloadAction = params.downloadAction;
		this.getSecret = params.getSecret;
		this.http = params.http;
		this.hasLocalReference = params.hasLocalReference;
		this.localizeAction = params.localizeAction;
		this.parser = params.parser;
		this.resolveVaultPath = params.resolveVaultPath;
		this.saveDialog = params.saveDialog;
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
			: (this.resolveVaultPath(target.target, context.noteFilePath) ?? undefined);
		if (!target.isRemote && !localPath) {
			return { message: t('errors.localImageNotFound'), ok: false, reason: 'missing' };
		}
		return this.downloadAction.execute({
			defaultFileName: fileName,
			http: this.http,
			...(localPath ? { localPath } : {}),
			...(target.isRemote ? { remoteUrl: target.target } : {}),
			saveDialog: this.saveDialog,
			vault: this.vault
		});
	}

	public async localizeAllRemoteInNote(
		context: ImageActionContext
	): Promise<ActionResult[]> {
		const { remote } = classifyRefs(this.parser.parse(context.note.getContent()));
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
			return { message: t('errors.alreadyLocal'), ok: false, reason: 'missing' };
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
		const { local } = classifyRefs(this.parser.parse(context.note.getContent()));
		const results: ActionResult[] = [];
		for (const ref of [...local].reverse()) {
			try {
				results.push(await this.uploadOne(ref, context));
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
			return { message: t('errors.alreadyRemote'), ok: false, reason: 'missing' };
		}
		const profile = this.settings.profiles.find(
			(item) => item.id === this.settings.activeProfileId
		);
		if (!profile) {
			return {
				message: t('errors.noActiveStorageProfile'),
				ok: false,
				reason: 'missing'
			};
		}
		if (!profile.publicBaseUrl.trim()) {
			return {
				message: t('errors.publicBaseUrlRequired'),
				ok: false,
				reason: 'missing'
			};
		}
		const accessKeyId = this.getSecret(profile.accessKeyIdSecretName);
		const secretAccessKey = this.getSecret(profile.secretAccessKeySecretName);
		if (!accessKeyId || !secretAccessKey) {
			return {
				message: t('errors.storageSecretsMissing'),
				ok: false,
				reason: 'missing'
			};
		}
		const secretProblem = validateStorageSecrets({
			accessKeyId,
			accessKeyIdSecretName: profile.accessKeyIdSecretName,
			secretAccessKey,
			secretAccessKeySecretName: profile.secretAccessKeySecretName
		});
		if (secretProblem) {
			return { message: secretProblem, ok: false, reason: 'missing' };
		}
		const localPath = this.resolveVaultPath(ref.target, context.noteFilePath);
		if (!localPath) {
			return { message: t('errors.localImageNotFound'), ok: false, reason: 'missing' };
		}
		const storage = await this.createStorage(profile, {
			accessKeyId,
			secretAccessKey
		});
		const ctx = createTemplateContext(ref.target, context.noteFilePath);
		return this.uploadAction.execute({
			ctx,
			deleteSourceAfterUpload: this.settings.deleteSourceAfterUpload,
			hasRemainingReference: (): Promise<boolean> => this.hasRemainingLocalReference(localPath, context),
			linkStyle: this.settings.linkStyle,
			localPath,
			note: context.note,
			noteFolderPath: ctx.noteFolderPath,
			objectKeyTemplate: profile.objectKeyTemplate,
			ref,
			storage,
			vault: this.vault
		});
	}

	private async hasRemainingLocalReference(
		localPath: string,
		context: ImageActionContext
	): Promise<boolean> {
		return this.hasLocalReference(localPath, context);
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
