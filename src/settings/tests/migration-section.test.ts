import {
	describe,
	expect,
	it
} from 'vitest';

import { t } from '../../i18n/index.ts';
import {
	displayMigrationSection,
	shouldShowMigrationSettings
} from '../sections/migration-section.ts';

describe('shouldShowMigrationSettings', () => {
	it('is desktop-only', () => {
		expect(shouldShowMigrationSettings(false)).toBe(true);
		expect(shouldShowMigrationSettings(true)).toBe(false);
	});
});

describe('displayMigrationSection', () => {
	it('renders the heading on desktop and nothing on mobile', () => {
		const desktop = createDiv();
		displayMigrationSection(desktop, (): void => undefined, false);
		expect(desktop.textContent).toContain(t('migration.section'));

		const mobile = createDiv();
		displayMigrationSection(mobile, (): void => undefined, true);
		expect(mobile.textContent).toBe('');
	});
});
