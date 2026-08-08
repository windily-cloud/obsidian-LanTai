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

import { validateStorageSecrets } from '../storage/storage-credential-guard.ts';

export interface ClassifiedImageRefs {
	local: ImageRef[];
	remote: ImageRef[];
}

export type CreateObjectStorage = (
	profile: StorageProfile,
	secrets: StorageSecrets
) => Promise<ObjectStorage>;

export type GetSecret = (name: string) => null | string;

export type HasLocalReference = (
	localPath: string,
	context: ImageActionContext
) => Promise<boolean>;

export interface ImageActionContext {
	note: NoteContent;
	noteFilePath: string;
}

export interface ImageActionFacadeConstructorParams {
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

export type ResolveVaultPath = (
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
			return { message: 'Local image was not found', ok: false, reason: 'missing' };
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
			return { message: 'Image is already local', ok: false, reason: 'missing' };
		}
		return this.localizeAction.execute({
			attachmentBase: this.settings.attachmentBase,
			ctx: createTemplateContext(ref.target, context.noteFilePath),
			http: this.http,
			linkStyle: this.settings.linkStyle,
			localPathTemplate: this.settings.localPathTemplate,
			note: context.note,
			noteFolderPath: noteFolderPath(context.noteFilePath),
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
			return { message: 'Image is already remote', ok: false, reason: 'missing' };
		}
		const profile = this.settings.profiles.find(
			(item) => item.id === this.settings.activeProfileId
		);
		if (!profile) {
			return {
				message: 'No active storage profile',
				ok: false,
				reason: 'missing'
			};
		}
		if (!profile.publicBaseUrl.trim()) {
			return {
				message: 'Public Base URL is required',
				ok: false,
				reason: 'missing'
			};
		}
		const accessKeyId = this.getSecret(profile.accessKeyIdSecretName);
		const secretAccessKey = this.getSecret(profile.secretAccessKeySecretName);
		if (!accessKeyId || !secretAccessKey) {
			return {
				message: 'Storage profile secrets are missing',
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
			return { message: 'Local image was not found', ok: false, reason: 'missing' };
		}
		const storage = await this.createStorage(profile, {
			accessKeyId,
			secretAccessKey
		});
		return this.uploadAction.execute({
			ctx: createTemplateContext(ref.target, context.noteFilePath),
			deleteSourceAfterUpload: this.settings.deleteSourceAfterUpload,
			hasRemainingReference: (): Promise<boolean> => this.hasRemainingLocalReference(localPath, context),
			linkStyle: this.settings.linkStyle,
			localPath,
			note: context.note,
			noteFolderPath: noteFolderPath(context.noteFilePath),
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
		message: error instanceof Error ? error.message : 'Image action failed.',
		ok: false,
		reason: 'error'
	};
}

function basename(path: string): string {
	const index = path.lastIndexOf('/');
	return index === -1 ? path : path.slice(index + 1);
}

function createTemplateContext(
	imageTarget: string,
	noteFilePathWithExtension: string
): NameTemplateContext {
	const notePath = stripExtension(noteFilePathWithExtension);
	const folderPath = noteFolderPath(noteFilePathWithExtension);
	const fileName = imageFileName(imageTarget);
	const extensionIndex = fileName.lastIndexOf('.');
	return {
		ext: extensionIndex > 0 ? fileName.slice(extensionIndex + 1) : '',
		noteFileName: basename(notePath),
		noteFilePath: notePath,
		noteFolderName: basename(folderPath),
		noteFolderPath: folderPath,
		now: new Date(),
		originalName: extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName
	};
}

function imageFileName(target: string): string {
	const withoutQuery = target.split(/[?#]/u, 1)[0] ?? target;
	const encodedName = basename(withoutQuery) || 'image';
	try {
		return decodeURIComponent(encodedName);
	} catch {
		return encodedName;
	}
}

function noteFolderPath(path: string): string {
	const index = path.lastIndexOf('/');
	return index === -1 ? '' : path.slice(0, index);
}

function stripExtension(path: string): string {
	const slashIndex = path.lastIndexOf('/');
	const extensionIndex = path.lastIndexOf('.');
	return extensionIndex > slashIndex ? path.slice(0, extensionIndex) : path;
}
