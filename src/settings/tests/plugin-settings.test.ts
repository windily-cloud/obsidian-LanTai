import {
	describe,
	expect,
	it
} from 'vitest';

import { PluginSettings } from '../plugin-settings.ts';

describe('PluginSettings', () => {
	it('exposes serializable defaults', () => {
		const settings = new PluginSettings();
		const json = JSON.parse(JSON.stringify(settings)) as PluginSettings;

		expect(json.activeProfileId).toBeNull();
		expect(json.profiles).toEqual([]);
		expect(json.attachmentBase).toBe('note');
		// eslint-disable-next-line no-template-curly-in-string -- name-template token syntax
		expect(json.localPathTemplate).toBe('${originalName}.${ext}');
		expect(json.linkStyle).toBe('wiki');
		expect(json.deleteSourceAfterUpload).toBe(false);
		expect(json.galleryProfileId).toBeNull();
	});
});
