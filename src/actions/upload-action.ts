import type { NoteContent } from '../adapters/obsidian/note-content.obsidian.ts';
import type { VaultBinary } from '../adapters/obsidian/vault-binary.obsidian.ts';
import type { ImageLinkService } from '../link/image-link-service.ts';
import type { ImageRef } from '../link/image-ref.ts';
import type { AttachmentPathResolver } from '../path/attachment-path-resolver.ts';
import type { NameTemplateContext } from '../path/name-template-context.ts';
import type { LinkStyle } from '../settings/plugin-settings.ts';
import type { ObjectStorage } from '../storage/object-storage.ts';
import type { UploadHistoryEntry } from '../storage/upload-history.ts';
import type { ActionResult } from './action-result.ts';

import { t } from '../i18n/index.ts';
import { imageFileName } from '../path/image-template-context.ts';
import { probeObjectExists } from '../storage/probe-object-exists.ts';

export interface KnownUpload {
	readonly key: string;
	readonly url: string;
}

export interface UploadActionInput {
	ctx: NameTemplateContext;
	deleteSourceAfterUpload: boolean;
	hasRemainingReference(): Promise<boolean>;
	knownUpload?: KnownUpload;
	linkStyle: LinkStyle;
	localPath: string;
	note: NoteContent;
	noteFolderPath: string;
	objectKeyTemplate: string;
	profileId: string;
	recordUpload(entry: UploadHistoryEntry): Promise<void>;
	ref: ImageRef;
	/** 只上传/解析 URL，不改写笔记。供迁移在改写前把真实 key 落盘。 */
	skipRewrite?: boolean;
	storage: ObjectStorage;
	vault: VaultBinary;
	writeMode: UploadWriteMode;
}

export type UploadWriteMode = 'linkOnly' | 'overwrite' | 'upload';

export class UploadAction {
	public constructor(
		private readonly pathResolver: AttachmentPathResolver,
		private readonly linkService: ImageLinkService
	) {}

	public async execute(input: UploadActionInput): Promise<ActionResult> {
		if (
			input.skipRewrite !== true
			&& input.note.getContent().slice(input.ref.start, input.ref.end) !== input.ref.source
		) {
			return { message: t('errors.linkChangedBeforeUpload'), ok: false, reason: 'conflict' };
		}

		let didUpload = false;
		let publicUrl: string;
		let uploadedKey: string;
		if (input.knownUpload) {
			publicUrl = input.knownUpload.url;
			uploadedKey = input.knownUpload.key;
		} else {
			const objectKey = this.pathResolver.resolveObjectKey({
				ctx: input.ctx,
				template: input.objectKeyTemplate
			});

			// 服务端生成对象键的存储（lantai）无法预测键，存在性探测既无意义也不会命中。
			if (input.writeMode === 'upload' && input.storage.clientKeyed !== false) {
				if ((await probeObjectExists(input.storage, objectKey)) === true) {
					return { ok: false, reason: 'conflict' };
				}
			}

			if (input.writeMode === 'linkOnly') {
				publicUrl = await input.storage.buildPublicUrl(objectKey);
				uploadedKey = objectKey;
			} else {
				const bytes = await input.vault.readBinary(input.localPath);
				const uploaded = await input.storage.upload({
					bytes,
					objectKey,
					originalName: imageFileName(input.localPath)
				});
				publicUrl = uploaded.url;
				uploadedKey = uploaded.key;
				didUpload = true;
			}
		}

		if (input.skipRewrite === true) {
			if (didUpload) {
				await recordUploadQuietly(input, uploadedKey, publicUrl);
			}
			return { key: uploadedKey, ok: true, url: publicUrl };
		}

		// 删源只认 vault 路径。必须在改写链接前算剩余引用并排除当前这一处，
		// 否则兰台雪花 URL 与本地文件名对不上，容易把刚上传的这一处误判为仍被引用。
		const remainingReference = input.deleteSourceAfterUpload
			? await input.hasRemainingReference()
			: true;

		const applied = await input.note.applyEdit({
			end: input.ref.end,
			expected: input.ref.source,
			replacement: this.linkService.formatTargetFromRef(
				input.ref,
				publicUrl,
				input.linkStyle
			),
			start: input.ref.start
		});
		if (!applied) {
			return {
				message: t('errors.uploadedButLinkChanged'),
				ok: false,
				reason: 'conflict'
			};
		}

		if (input.deleteSourceAfterUpload && !remainingReference) {
			await input.vault.trash(input.localPath);
		}

		if (didUpload) {
			await recordUploadQuietly(input, uploadedKey, publicUrl);
		}

		return { key: uploadedKey, ok: true, url: publicUrl };
	}
}

async function recordUploadQuietly(
	input: UploadActionInput,
	key: string,
	url: string
): Promise<void> {
	try {
		await input.recordUpload({
			key,
			profileId: input.profileId,
			timestamp: Date.now(),
			url
		});
	} catch {
		// History persistence must not affect the upload result.
	}
}
