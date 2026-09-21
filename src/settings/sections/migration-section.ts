import {
	Platform,
	Setting
} from 'obsidian';

import { t } from '../../i18n/index.ts';
import { addSectionHeading } from '../helpers/section-heading.ts';

export function displayMigrationSection(
	containerEl: HTMLElement,
	openMigration: () => void,
	isMobile: boolean = Platform.isMobile
): void {
	if (!shouldShowMigrationSettings(isMobile)) {
		return;
	}
	addSectionHeading(containerEl, t('migration.section'), 'lucide-arrow-up-from-line');
	new Setting(containerEl)
		.setName(t('migration.start'))
		.setDesc(t('migration.sectionDesc'))
		.addButton((button) =>
			button.setButtonText(t('migration.start')).setCta().onClick(() => {
				openMigration();
			})
		);
}

/** Exposed for unit tests. */
export function shouldShowMigrationSettings(isMobile: boolean = Platform.isMobile): boolean {
	return !isMobile;
}
