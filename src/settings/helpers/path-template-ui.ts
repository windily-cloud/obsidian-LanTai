import {
	displayTooltip,
	ExtraButtonComponent
} from 'obsidian';

import type { NameTemplateContext } from '../../path/name-template-context.ts';

import { t } from '../../i18n/index.ts';

export function attachTokenInfoButton(nameEl: HTMLElement): void {
	const info = new ExtraButtonComponent(nameEl).setIcon('info');
	info.extraSettingsEl.addClass('lantai-token-info');
	function showTokenTooltip(): void {
		displayTooltip(info.extraSettingsEl, buildPathTemplateTokenTooltip(), {
			classes: ['lantai-token-tooltip'],
			placement: 'bottom'
		});
	}
	info.extraSettingsEl.addEventListener('mouseenter', showTokenTooltip);
	info.onClick(showTokenTooltip);
}

export function previewContext(): NameTemplateContext {
	return {
		ext: 'png',
		noteFileName: 'Example',
		noteFilePath: 'Notes/Example',
		noteFolderName: 'Notes',
		noteFolderPath: 'Notes',
		now: new Date(),
		originalName: 'image'
	};
}

function buildPathTemplateTokenTooltip(): DocumentFragment {
	const fragment = createFragment();
	const list = createEl('ul');
	list.className = 'lantai-token-list';
	for (const item of pathTemplateTokenItems()) {
		const li = createEl('li');
		li.textContent = item;
		list.append(li);
	}
	fragment.append(list);
	return fragment;
}

function pathTemplateTokenItems(): string[] {
	return [
		t('settings.tokenNoteFileName'),
		t('settings.tokenNoteFolderName'),
		t('settings.tokenNoteFilePath'),
		t('settings.tokenNoteFolderPath'),
		t('settings.tokenDate'),
		t('settings.tokenUuid'),
		t('settings.tokenRandom'),
		t('settings.tokenOriginalName'),
		t('settings.tokenExt')
	];
}
