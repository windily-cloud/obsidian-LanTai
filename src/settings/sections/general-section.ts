import { Setting } from 'obsidian';

import type { SettingsSectionContext } from './settings-section-context.ts';

import {
	attachTokenInfoButton,
	previewContext
} from '../helpers/path-template-ui.ts';
import { addSectionHeading } from '../helpers/section-heading.ts';

export function displayGeneralSection(
	containerEl: HTMLElement,
	ctx: SettingsSectionContext
): void {
	addSectionHeading(containerEl, 'General', 'settings');

	new Setting(containerEl)
		.setName('Attachment base')
		.setDesc('Only affects paths managed by this plugin.')
		.addDropdown((dropdown) => {
			dropdown
				.addOption('note', 'Current note folder')
				.addOption('vault', 'Vault root')
				.setValue(ctx.settings.attachmentBase)
				.onChange((value) => {
					ctx.settings.attachmentBase = value as 'note' | 'vault';
					ctx.persistAndRedisplay();
				});
		});

	const pathSetting = new Setting(containerEl)
		.setName('Local path template')
		.setDesc(localPathTemplateDesc(ctx, ctx.settings.localPathTemplate))
		.setClass('lantai-path-template');
	attachTokenInfoButton(pathSetting.nameEl);
	pathSetting.addText((text) => {
		text.setValue(ctx.settings.localPathTemplate).onChange((value) => {
			ctx.settings.localPathTemplate = value;
			pathSetting.setDesc(localPathTemplateDesc(ctx, value));
			ctx.persist();
		});
	});

	new Setting(containerEl)
		.setName('Local image link style')
		.setDesc('Remote image URLs always use Markdown syntax.')
		.addDropdown((dropdown) => {
			dropdown
				.addOption('wiki', 'Wiki')
				.addOption('markdown', 'Markdown')
				.setValue(ctx.settings.linkStyle)
				.onChange((value) => {
					ctx.settings.linkStyle = value as 'markdown' | 'wiki';
					ctx.persist();
				});
		});
}

function localPathTemplateDesc(ctx: SettingsSectionContext, template: string): string {
	try {
		const preview = ctx.pathResolver.resolveLocalPath({
			base: ctx.settings.attachmentBase,
			ctx: previewContext(),
			noteFolderPath: 'Notes',
			template
		});
		return `Preview: ${preview}`;
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Invalid template';
		return `Invalid template: ${message}`;
	}
}
