import {
	describe,
	expect,
	it
} from 'vitest';

import { shouldShowMigrationSettings } from '../sections/migration-section.ts';

describe('shouldShowMigrationSettings', () => {
	it('shows migration settings on desktop', () => {
		expect(shouldShowMigrationSettings(false)).toBe(true);
	});

	it('hides migration settings on mobile', () => {
		expect(shouldShowMigrationSettings(true)).toBe(false);
	});
});
