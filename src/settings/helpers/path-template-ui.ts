import {
	displayTooltip,
	ExtraButtonComponent
} from 'obsidian';

import type { NameTemplateContext } from '../../path/name-template-context.ts';

/* eslint-disable no-template-curly-in-string -- token docs shown in UI tooltip */
const PATH_TEMPLATE_TOKEN_ITEMS = [
	'${noteFileName} — Note name (no ext)',
	'${noteFolderName} — Parent folder name',
	'${noteFilePath} — Note path (no ext)',
	'${noteFolderPath} — Parent folder path',
	'${date} — Date (YYYY-MM-DD; :format)',
	'${uuid} — UUID without hyphens',
	'${random} — Random chars (:length)',
	'${originalName} — Image name (no ext)',
	'${ext} — Image extension'
];
/* eslint-enable no-template-curly-in-string -- token docs shown in UI tooltip */

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
	for (const item of PATH_TEMPLATE_TOKEN_ITEMS) {
		const li = createEl('li');
		li.textContent = item;
		list.append(li);
	}
	fragment.append(list);
	return fragment;
}
