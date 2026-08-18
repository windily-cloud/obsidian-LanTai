import type { App } from 'obsidian';

import {
	describe,
	expect,
	it
} from 'vitest';

import type { S3SectionContext } from '../sections/s3/s3-section.ts';
import type { StorageProfile } from '../sections/s3/storage-profile.ts';

import { AttachmentPathResolver } from '../../path/attachment-path-resolver.ts';
import { NameTemplateEngine } from '../../path/name-template-engine.ts';
import { StorageProfileRegistry } from '../helpers/storage-profile-registry.ts';
import {
	buildLanTaiSettingDefinitions,
	PluginSettings,
	refreshSettingsTab
} from '../plugin-settings.ts';

interface SettingControlShape {
	key: string;
	type: string;
}

interface SettingGroupShape {
	heading?: string;
	items?: unknown[];
	type: string;
}

interface SettingItemShape {
	control?: SettingControlShape;
	name?: string;
	render?: unknown;
}

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
		expect(json.gallerySource).toBe('recent');
		expect(json).not.toHaveProperty('galleryUploadKeyTemplate');
		expect(json).not.toHaveProperty('uploadHistory');
	});
});

describe('refreshSettingsTab', () => {
	it('uses update when the declarative settings API is present', () => {
		const calls: string[] = [];
		refreshSettingsTab({
			display(): void {
				calls.push('display');
			},
			update(): void {
				calls.push('update');
			}
		});
		expect(calls).toEqual(['update']);
	});

	it('falls back to display when update is missing', () => {
		const calls: string[] = [];
		refreshSettingsTab({
			display(): void {
				calls.push('display');
			}
		});
		expect(calls).toEqual(['display']);
	});
});

describe('buildLanTaiSettingDefinitions', () => {
	it('returns searchable general controls and an S3 group without gallery upload key template', () => {
		const settings = new PluginSettings();
		const pathResolver = new AttachmentPathResolver(new NameTemplateEngine());
		const registry = new StorageProfileRegistry(settings);
		const definitions = buildLanTaiSettingDefinitions({
			buildSectionContext(): S3SectionContext {
				return buildContext(settings, pathResolver, registry);
			},
			pathResolver,
			settings
		});

		expect(definitions).toHaveLength(2);
		const general: unknown = definitions[0];
		const s3: unknown = definitions[1];
		expect(isSettingGroup(general)).toBe(true);
		expect(isSettingGroup(s3)).toBe(true);
		if (!isSettingGroup(general) || !isSettingGroup(s3)) {
			throw new Error('expected setting groups');
		}

		expect(typeof general.heading).toBe('string');
		expect(typeof s3.heading).toBe('string');

		const generalItems = general.items ?? [];
		expect(generalItems.some((item) => hasControlKey(item, 'attachmentBase', 'dropdown'))).toBe(true);
		expect(generalItems.some((item) => hasControlKey(item, 'linkStyle', 'dropdown'))).toBe(true);
		expect(generalItems.some((item) => hasRender(item))).toBe(true);
		expect(generalItems.some((item) => hasName(item, 'Gallery upload key template'))).toBe(false);
		expect(generalItems.some((item) => hasName(item, '画廊上传键模板'))).toBe(false);

		const s3Items = s3.items ?? [];
		expect(s3Items.some((item) => hasRender(item))).toBe(true);
		expect(s3Items.some((item) => hasControlKey(item, 'deleteSourceAfterUpload', 'toggle'))).toBe(true);
	});
});

function buildContext(
	settings: PluginSettings,
	pathResolver: AttachmentPathResolver,
	registry: StorageProfileRegistry
): S3SectionContext {
	return {
		app: createFakeApp(),
		applyProfileDraft(_profileId: string): void {
			return undefined;
		},
		expandedProfileIds: new Set(),
		getProfileDraft(profile: StorageProfile): StorageProfile {
			return profile;
		},
		pathResolver,
		persist(): void {
			return undefined;
		},
		persistAndRedisplay(): void {
			return undefined;
		},
		profileDrafts: new Map(),
		redisplay(): void {
			return undefined;
		},
		registry,
		settings,
		toggleProfileExpanded(_profileId: string): void {
			return undefined;
		}
	};
}

function createFakeApp(): App {
	return Object.create(null) as App;
}

function hasControlKey(item: unknown, key: string, type: string): boolean {
	if (!isSettingItemShape(item) || item.control === undefined) {
		return false;
	}
	return item.control.key === key && item.control.type === type;
}

function hasName(item: unknown, name: string): boolean {
	return isSettingItemShape(item) && item.name === name;
}

function hasRender(item: unknown): boolean {
	return isSettingItemShape(item) && typeof item.render === 'function';
}

function isSettingGroup(item: unknown): item is SettingGroupShape {
	return typeof item === 'object' && item !== null && 'type' in item && item.type === 'group';
}

function isSettingItemShape(item: unknown): item is SettingItemShape {
	return typeof item === 'object' && item !== null;
}
