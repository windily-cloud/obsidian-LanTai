import type { HttpFetch } from '../adapters/obsidian/http-fetch.obsidian.ts';
import type { NoteContent } from '../adapters/obsidian/note-content.obsidian.ts';
import type { VaultBinary } from '../adapters/obsidian/vault-binary.obsidian.ts';
import type { ImageLinkService } from '../link/image-link-service.ts';
import type { ImageRef } from '../link/image-ref.ts';
import type { AttachmentPathResolver } from '../path/attachment-path-resolver.ts';
import type { NameTemplateContext } from '../path/name-template-context.ts';
import type {
	AttachmentBase,
	LinkStyle
} from '../settings/plugin-settings.ts';
import type { ActionResult } from './action-result.ts';

import { t } from '../i18n/index.ts';

interface LocalizeActionInput {
	attachmentBase: AttachmentBase;
	ctx: NameTemplateContext;
	http: HttpFetch;
	linkStyle: LinkStyle;
	localPathTemplate: string;
	note: NoteContent;
	noteFolderPath: string;
	ref: ImageRef;
	remoteUrl: string;
	vault: VaultBinary;
}

export class LocalizeAction {
	public constructor(
		private readonly pathResolver: AttachmentPathResolver,
		private readonly linkService: ImageLinkService
	) {}

	public async execute(input: LocalizeActionInput): Promise<ActionResult> {
		if (input.note.getContent().slice(input.ref.start, input.ref.end) !== input.ref.source) {
			return { message: t('errors.linkChangedBeforeLocalize'), ok: false, reason: 'conflict' };
		}
		const localPath = this.pathResolver.resolveLocalPath({
			base: input.attachmentBase,
			ctx: input.ctx,
			noteFolderPath: input.noteFolderPath,
			template: input.localPathTemplate
		});

		if (await input.vault.exists(localPath)) {
			return this.replaceLink(input, localPath);
		}

		const bytes = await input.http.fetchBinary(input.remoteUrl);

		if (await input.vault.exists(localPath)) {
			return { ok: false, reason: 'conflict' };
		}

		await input.vault.writeBinary(localPath, bytes);

		return this.replaceLink(input, localPath);
	}

	private async replaceLink(input: LocalizeActionInput, localPath: string): Promise<ActionResult> {
		const applied = await input.note.applyEdit({
			end: input.ref.end,
			expected: input.ref.source,
			replacement: this.linkService.formatTarget(localPath, input.linkStyle),
			start: input.ref.start
		});
		return applied
			? { ok: true }
			: {
				message: t('errors.savedButLinkChanged'),
				ok: false,
				reason: 'conflict'
			};
	}
}
