import type { NoteContent } from '../adapters/obsidian/note-content.obsidian.ts';
import type { VaultBinary } from '../adapters/obsidian/vault-binary.obsidian.ts';
import type { ImageLinkService } from '../link/image-link-service.ts';
import type { ImageRef } from '../link/image-ref.ts';
import type { AttachmentPathResolver } from '../path/attachment-path-resolver.ts';
import type { NameTemplateContext } from '../path/name-template-context.ts';
import type { LinkStyle } from '../settings/plugin-settings.ts';
import type { ObjectStorage } from '../storage/object-storage.ts';
import type { ActionResult } from './action-result.ts';

export interface UploadActionInput {
	ctx: NameTemplateContext;
	deleteSourceAfterUpload: boolean;
	hasRemainingReference(): Promise<boolean>;
	linkStyle: LinkStyle;
	localPath: string;
	note: NoteContent;
	noteFolderPath: string;
	objectKeyTemplate: string;
	ref: ImageRef;
	storage: ObjectStorage;
	vault: VaultBinary;
}

export class UploadAction {
	public constructor(
		private readonly pathResolver: AttachmentPathResolver,
		private readonly linkService: ImageLinkService
	) {}

	public async execute(input: UploadActionInput): Promise<ActionResult> {
		if (input.note.getContent().slice(input.ref.start, input.ref.end) !== input.ref.source) {
			return { message: 'The image link changed before upload started.', ok: false, reason: 'conflict' };
		}
		const objectKey = this.pathResolver.resolveObjectKey({
			ctx: input.ctx,
			template: input.objectKeyTemplate
		});

		if (await input.storage.exists(objectKey)) {
			return { ok: false, reason: 'conflict' };
		}

		const bytes = await input.vault.readBinary(input.localPath);
		await input.storage.upload(objectKey, bytes);

		const publicUrl = await input.storage.buildPublicUrl(objectKey);
		const applied = await input.note.applyEdit({
			end: input.ref.end,
			expected: input.ref.source,
			replacement: this.linkService.formatTarget(publicUrl, input.linkStyle),
			start: input.ref.start
		});
		if (!applied) {
			return {
				message: 'Image uploaded, but the note link changed before it could be updated.',
				ok: false,
				reason: 'conflict'
			};
		}

		if (input.deleteSourceAfterUpload && !(await input.hasRemainingReference())) {
			await input.vault.trash(input.localPath);
		}

		return { ok: true };
	}
}
