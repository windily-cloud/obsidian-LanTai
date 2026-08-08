import {
	setIcon,
	Setting
} from 'obsidian';

export function addSectionHeading(
	containerEl: HTMLElement,
	title: string,
	iconId: string
): Setting {
	const setting = new Setting(containerEl)
		.setName(title)
		.setHeading()
		.setClass('lantai-section-heading');
	const iconEl = setting.nameEl.createSpan({ cls: 'lantai-section-icon' });
	setting.nameEl.prepend(iconEl);
	setIcon(iconEl, iconId);
	return setting;
}
