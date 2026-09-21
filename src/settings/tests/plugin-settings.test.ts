import type { App } from 'obsidian';

import {
	describe,
	expect,
	it
} from 'vitest';

import type { LanTaiAccountClient } from '../../lantai/lantai-account.ts';
import type { LanTaiAccountSectionContext } from '../sections/lantai/lantai-account-section.ts';
import type { S3SectionContext } from '../sections/s3/s3-section.ts';
import type { StorageProfile } from '../sections/s3/storage-profile.ts';

import { t } from '../../i18n/index.ts';
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
	aliases?: string[];
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
		expect(json).not.toHaveProperty('galleryProfileId');
		expect(json).not.toHaveProperty('gallerySource');
		expect(json).not.toHaveProperty('galleryUploadKeyTemplate');
		expect(json).not.toHaveProperty('layout');
		expect(json).not.toHaveProperty('panelOpen');
		expect(json).not.toHaveProperty('panelWidth');
		expect(json).not.toHaveProperty('selectedKey');
		expect(json).not.toHaveProperty('sortKey');
		expect(json).not.toHaveProperty('sortOrder');
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
	it('returns searchable general controls and a storage group without gallery upload key template', () => {
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

		expect(definitions).toHaveLength(3);
		const general: unknown = definitions[0];
		const storage: unknown = definitions[1];
		const migration: unknown = definitions[2];
		expect(isSettingGroup(general)).toBe(true);
		expect(isSettingGroup(storage)).toBe(true);
		expect(isSettingGroup(migration)).toBe(true);
		if (!isSettingGroup(general) || !isSettingGroup(storage) || !isSettingGroup(migration)) {
			throw new Error('expected setting groups');
		}

		expect(typeof general.heading).toBe('string');
		expect(typeof storage.heading).toBe('string');
		expect(migration.heading).toBe(t('migration.section'));

		const generalItems = general.items ?? [];
		expect(generalItems.some((item) => hasControlKey(item, 'attachmentBase', 'dropdown'))).toBe(true);
		expect(generalItems.some((item) => hasControlKey(item, 'linkStyle', 'dropdown'))).toBe(true);
		expect(generalItems.some((item) => hasRender(item))).toBe(true);
		expect(generalItems.some((item) => hasName(item, 'Gallery upload key template'))).toBe(false);
		expect(generalItems.some((item) => hasName(item, '画廊上传键模板'))).toBe(false);

		const storageItems = storage.items ?? [];
		expect(storageItems.some((item) => hasRender(item))).toBe(true);
		expect(storageItems.some((item) => hasControlKey(item, 'deleteSourceAfterUpload', 'toggle'))).toBe(true);
		expect(storageItems.some((item) => hasAlias(item, t('settings.lantaiApiKey')))).toBe(true);
	});

	it('omits the migration group on mobile', () => {
		const settings = new PluginSettings();
		const pathResolver = new AttachmentPathResolver(new NameTemplateEngine());
		const registry = new StorageProfileRegistry(settings);
		const definitions = buildLanTaiSettingDefinitions({
			buildSectionContext(): S3SectionContext {
				return buildContext(settings, pathResolver, registry);
			},
			isMobile: true,
			pathResolver,
			settings
		});
		expect(definitions).toHaveLength(2);
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
		lanTaiAccount: buildLanTaiContext(),
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

function buildLanTaiContext(): LanTaiAccountSectionContext {
	return {
		app: createFakeApp(),
		client: Object.create(null) as LanTaiAccountClient,
		getApiKey(): null | string {
			return null;
		},
		openUrl(_url: string): void {
			return undefined;
		},
		redisplay(): void {
			return undefined;
		},
		setApiKey(_value: null | string): void {
			return undefined;
		}
	};
}

function createFakeApp(): App {
	return Object.create(null) as App;
}

function hasAlias(item: unknown, alias: string): boolean {
	return isSettingItemShape(item) && (item.aliases ?? []).includes(alias);
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
