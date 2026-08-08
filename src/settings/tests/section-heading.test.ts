import {
	describe,
	expect,
	it
} from 'vitest';

import { addSectionHeading } from '../helpers/section-heading.ts';

describe('addSectionHeading', () => {
	it('renders a heading with icon before the title', () => {
		const containerEl = document.body.createDiv();
		const setting = addSectionHeading(containerEl, 'General', 'settings');

		expect(setting.settingEl.classList.contains('setting-item-heading')).toBe(true);
		expect(setting.settingEl.classList.contains('lantai-section-heading')).toBe(true);
		expect(setting.nameEl.textContent).toContain('General');

		const iconEl = setting.nameEl.querySelector('.lantai-section-icon');
		expect(iconEl).not.toBeNull();
		expect(setting.nameEl.firstElementChild).toBe(iconEl);
	});
});
