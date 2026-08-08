import { addSectionHeading } from '../helpers/section-heading.ts';

export function displayImageProcessingSection(containerEl: HTMLElement): void {
	addSectionHeading(containerEl, 'Image processing', 'image');
	containerEl.createEl('p', {
		text: 'Compression, OCR, and related options will appear here.'
	});
}
