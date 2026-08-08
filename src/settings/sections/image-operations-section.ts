import { addSectionHeading } from '../helpers/section-heading.ts';

export function displayImageOperationsSection(containerEl: HTMLElement): void {
	addSectionHeading(containerEl, 'Image operations', 'wrench');
	containerEl.createEl('p', {
		text: 'Image toolkit actions (zoom, annotate, etc.) will appear here.'
	});
}
