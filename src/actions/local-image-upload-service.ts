import type { NoteContent } from '../adapters/obsidian/note-content.obsidian.ts';
import type { VaultBinary } from '../adapters/obsidian/vault-binary.obsidian.ts';
import type { ImageLinkParser } from '../link/image-link-parser.ts';
import type { ImageRef } from '../link/image-ref.ts';
import type { NameTemplateContext } from '../path/name-template-context.ts';
import type { LinkStyle } from '../settings/plugin-settings.ts';
import type { ObjectStorage } from '../storage/object-storage.ts';
import type { UploadHistoryEntry } from '../storage/upload-history.ts';
import type { ActionResult } from './action-result.ts';
import type {
	KnownUpload,
	UploadAction,
	UploadWriteMode
} from './upload-action.ts';

import { t } from '../i18n/index.ts';
import { createImageTemplateContext } from '../path/image-template-context.ts';

export interface LocalImageRewriteTarget {
	readonly note: NoteContent;
	readonly noteFilePath: string;
	readonly source: string;
}

export interface UniqueFileUploadInput {
	readonly deleteSourceAfterUpload: boolean;
	hasRemainingReference(): Promise<boolean>;
	readonly knownUpload?: KnownUpload;
	readonly linkStyle: LinkStyle;
	readonly localPath: string;
	readonly objectKeyTemplate: string;
	onUploaded?(info: KnownUpload): Promise<void>;
	readonly profileId: string;
	recordUpload(entry: UploadHistoryEntry): Promise<void>;
	readonly storage: ObjectStorage;
	readonly targets: readonly LocalImageRewriteTarget[];
	readonly vault: VaultBinary;
	readonly writeMode: UploadWriteMode;
}

export interface UniqueFileUploadResult {
	readonly key?: string;
	readonly ok: boolean;
	readonly results: ActionResult[];
	readonly url?: string;
}

interface EnsureUploadedFailure {
	readonly ok: false;
	readonly result: ActionResult;
}

type EnsureUploadedResult = EnsureUploadedFailure | EnsureUploadedSuccess;

interface EnsureUploadedSuccess {
	readonly ok: true;
	readonly upload: KnownUpload;
}

interface LocalImageUploadServiceConstructorParams {
	readonly parser: ImageLinkParser;
	resolveVaultPath(target: string, noteFilePath: string): null | string;
	readonly uploadAction: UploadAction;
}

/**
 * 同一本地文件只上传一次，再按 ImageRef CAS 改写所有给定引用。
 * 改写前重新 parse，避免笔记在扫描后被编辑导致偏移失效。
 */
export class LocalImageUploadService {
	private readonly parser: ImageLinkParser;
	private readonly resolveVaultPath: LocalImageUploadServiceConstructorParams['resolveVaultPath'];
	private readonly uploadAction: UploadAction;

	public constructor(params: LocalImageUploadServiceConstructorParams) {
		this.parser = params.parser;
		this.resolveVaultPath = (target, noteFilePath): null | string => params.resolveVaultPath(target, noteFilePath);
		this.uploadAction = params.uploadAction;
	}

	public async uploadUniqueFile(input: UniqueFileUploadInput): Promise<UniqueFileUploadResult> {
		const first = input.targets[0];
		if (!first) {
			return { ok: true, results: [] };
		}
		const ctx = createImageTemplateContext(input.localPath, first.noteFilePath);
		const known = await this.ensureUploaded(input, first, ctx);
		if (!known.ok) {
			return { ok: false, results: [known.result] };
		}
		if (input.onUploaded) {
			await input.onUploaded(known.upload);
		}

		const results: ActionResult[] = [];
		let allOk = true;
		for (const target of input.targets) {
			const ref = this.findMatchingRef(target, input.localPath);
			if (!ref) {
				results.push({
					message: t('errors.linkChangedBeforeUpload'),
					ok: false,
					reason: 'conflict'
				});
				allOk = false;
				continue;
			}
			try {
				const result = await this.uploadAction.execute({
					ctx,
					deleteSourceAfterUpload: false,
					hasRemainingReference: (): Promise<boolean> => Promise.resolve(true),
					knownUpload: known.upload,
					linkStyle: input.linkStyle,
					localPath: input.localPath,
					note: target.note,
					noteFolderPath: ctx.noteFolderPath,
					objectKeyTemplate: input.objectKeyTemplate,
					profileId: input.profileId,
					recordUpload: (entry): Promise<void> => input.recordUpload(entry),
					ref,
					storage: input.storage,
					vault: input.vault,
					writeMode: 'linkOnly'
				});
				results.push(result);
				if (!result.ok) {
					allOk = false;
				}
			} catch (error) {
				results.push({
					message: error instanceof Error ? error.message : t('errors.imageActionFailed'),
					ok: false,
					reason: 'error'
				});
				allOk = false;
			}
		}

		if (input.deleteSourceAfterUpload && allOk) {
			const remaining = await input.hasRemainingReference();
			if (!remaining) {
				await input.vault.trash(input.localPath);
			}
		}

		return {
			key: known.upload.key,
			ok: allOk,
			results,
			url: known.upload.url
		};
	}

	private async ensureUploaded(
		input: UniqueFileUploadInput,
		first: LocalImageRewriteTarget,
		ctx: NameTemplateContext
	): Promise<EnsureUploadedResult> {
		if (input.knownUpload) {
			return { ok: true, upload: input.knownUpload };
		}
		const ref = this.findMatchingRef(first, input.localPath) ?? this.parser.parse(first.note.getContent())[0];
		if (!ref) {
			return {
				ok: false,
				result: {
					message: t('errors.localImageNotFound'),
					ok: false,
					reason: 'missing'
				}
			};
		}
		const uploaded = await this.uploadAction.execute({
			ctx,
			deleteSourceAfterUpload: false,
			hasRemainingReference: (): Promise<boolean> => Promise.resolve(true),
			linkStyle: input.linkStyle,
			localPath: input.localPath,
			note: first.note,
			noteFolderPath: ctx.noteFolderPath,
			objectKeyTemplate: input.objectKeyTemplate,
			profileId: input.profileId,
			recordUpload: (entry): Promise<void> => input.recordUpload(entry),
			ref,
			skipRewrite: true,
			storage: input.storage,
			vault: input.vault,
			writeMode: input.writeMode
		});
		if (!uploaded.ok || uploaded.cancelled === true || !uploaded.key || !uploaded.url) {
			return {
				ok: false,
				result: uploaded.ok
					? { cancelled: true, ok: true }
					: uploaded
			};
		}
		return { ok: true, upload: { key: uploaded.key, url: uploaded.url } };
	}

	private findMatchingRef(
		target: LocalImageRewriteTarget,
		localPath: string
	): ImageRef | null {
		const matches = this.parser.parse(target.note.getContent()).filter((ref) => {
			if (ref.isRemote || ref.source !== target.source) {
				return false;
			}
			return this.resolveVaultPath(ref.target, target.noteFilePath) === localPath;
		});
		return matches[matches.length - 1] ?? null;
	}
}
