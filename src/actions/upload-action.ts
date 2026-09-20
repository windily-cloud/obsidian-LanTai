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
import { probeObjectExists } from '../storage/probe-object-exists.ts';

export type UploadWriteMode = 'linkOnly' | 'overwrite' | 'upload';

interface UploadActionInput {
	ctx: NameTemplateContext;
	deleteSourceAfterUpload: boolean;
	hasRemainingReference(): Promise<boolean>;
	linkStyle: LinkStyle;
	localPath: string;
	note: NoteContent;
	noteFolderPath: string;
	objectKeyTemplate: string;
	profileId: string;
	recordUpload(entry: UploadHistoryEntry): Promise<void>;
	ref: ImageRef;
	storage: ObjectStorage;
	vault: VaultBinary;
	writeMode: UploadWriteMode;
}

export class UploadAction {
	public constructor(
		private readonly pathResolver: AttachmentPathResolver,
		private readonly linkService: ImageLinkService
	) {}

	public async execute(input: UploadActionInput): Promise<ActionResult> {
		if (input.note.getContent().slice(input.ref.start, input.ref.end) !== input.ref.source) {
			return { message: t('errors.linkChangedBeforeUpload'), ok: false, reason: 'conflict' };
		}
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

		// 删源只认 vault 路径。必须在改写链接前算剩余引用并排除当前这一处，
		// 否则兰台雪花 URL 与本地文件名对不上，容易把刚上传的这一处误判为仍被引用。
		const remainingReference = input.deleteSourceAfterUpload
			? await input.hasRemainingReference()
			: true;

		// 链接与历史记录一律使用存储返回的权威 key / url：服务端可能重写扩展名。
		let publicUrl: string;
		let uploadedKey = objectKey;
		if (input.writeMode === 'linkOnly') {
			publicUrl = await input.storage.buildPublicUrl(objectKey);
		} else {
			const bytes = await input.vault.readBinary(input.localPath);
			const uploaded = await input.storage.upload({ bytes, objectKey });
			publicUrl = uploaded.url;
			uploadedKey = uploaded.key;
		}
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

		if (input.writeMode !== 'linkOnly') {
			try {
				await input.recordUpload({
					key: uploadedKey,
					profileId: input.profileId,
					timestamp: Date.now(),
					url: publicUrl
				});
			} catch {
				// History persistence must not affect the upload result.
			}
		}

		return { ok: true };
	}
}
