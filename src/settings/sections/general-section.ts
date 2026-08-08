import { Setting } from 'obsidian';

import type { SettingsSectionContext } from './settings-section-context.ts';

import { t } from '../../i18n/index.ts';
import {
	attachTokenInfoButton,
	previewContext
} from '../helpers/path-template-ui.ts';
import { addSectionHeading } from '../helpers/section-heading.ts';

export function displayGeneralSection(
	containerEl: HTMLElement,
	ctx: SettingsSectionContext
): void {
	addSectionHeading(containerEl, t('settings.general'), 'settings');

	new Setting(containerEl)
		.setName(t('settings.attachmentBase'))
		.setDesc(t('settings.attachmentBaseDesc'))
		.addDropdown((dropdown) => {
			dropdown
				.addOption('note', t('settings.currentNoteFolder'))
				.addOption('vault', t('settings.vaultRoot'))
				.setValue(ctx.settings.attachmentBase)
				.onChange((value) => {
					ctx.settings.attachmentBase = value as 'note' | 'vault';
					ctx.persistAndRedisplay();
				});
		});

	const pathSetting = new Setting(containerEl)
		.setName(t('settings.localPathTemplate'))
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
		.setName(t('settings.linkStyle'))
		.setDesc(t('settings.linkStyleDesc'))
		.addDropdown((dropdown) => {
			dropdown
				.addOption('wiki', t('settings.wiki'))
				.addOption('markdown', t('settings.markdown'))
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
		return t('settings.preview', { path: preview });
	} catch (error) {
		const message = error instanceof Error ? error.message : t('settings.invalidTemplate');
		return t('settings.invalidTemplateWithMessage', { message });
	}
}
