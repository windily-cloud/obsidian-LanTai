import type {
	App,
	Plugin,
	Setting,
	SettingDefinitionItem
} from 'obsidian';

import { PluginSettingTab } from 'obsidian';

import type { AttachmentPathResolver } from '../path/attachment-path-resolver.ts';
import type { S3SectionContext } from './sections/s3/s3-section.ts';
import type { StorageProfile } from './sections/s3/storage-profile.ts';

import { t } from '../i18n/index.ts';
import {
	attachTokenInfoButton,
	previewContext
} from './helpers/path-template-ui.ts';
import { StorageProfileRegistry } from './helpers/storage-profile-registry.ts';
import { displayS3SectionBody } from './sections/s3/s3-section.ts';
// Stub sections (image processing / operations) — re-enable when implemented.
export type AttachmentBase = 'note' | 'vault';
export type LinkStyle = 'markdown' | 'wiki';

interface BuildLanTaiSettingDefinitionsParams {
	buildSectionContext(): S3SectionContext;
	readonly pathResolver: AttachmentPathResolver;
	readonly settings: PluginSettings;
}

type PersistPluginSettings = () => Promise<void>;

interface PluginSettingsTabConstructorParams {
	readonly app: App;
	readonly pathResolver: AttachmentPathResolver;
	readonly plugin: Plugin;
	readonly saveSettings: PersistPluginSettings;
	readonly settings: PluginSettings;
}

export class PluginSettings {
	public activeProfileId: null | string = null;
	public attachmentBase: AttachmentBase = 'note';
	public deleteSourceAfterUpload = false;
	public galleryProfileId: null | string = null;
	public linkStyle: LinkStyle = 'wiki';
	// eslint-disable-next-line no-template-curly-in-string -- name-template token syntax
	public localPathTemplate = '${originalName}.${ext}';
	public profiles: StorageProfile[] = [];
}

export class PluginSettingsTab extends PluginSettingTab {
	private readonly expandedProfileIds = new Set<string>();
	private readonly pathResolver: AttachmentPathResolver;
	private readonly profileDrafts = new Map<string, StorageProfile>();
	private readonly registry: StorageProfileRegistry;
	private readonly saveSettings: () => Promise<void>;
	private readonly settings: PluginSettings;

	public constructor(params: PluginSettingsTabConstructorParams) {
		super(params.app, params.plugin);
		this.pathResolver = params.pathResolver;
		this.registry = new StorageProfileRegistry(params.settings);
		this.saveSettings = (): Promise<void> => params.saveSettings();
		this.settings = params.settings;
	}

	public override getControlValue(key: string): unknown {
		return this.settings[key as keyof PluginSettings];
	}

	public override getSettingDefinitions(): SettingDefinitionItem[] {
		return buildLanTaiSettingDefinitions({
			buildSectionContext: (): S3SectionContext => this.buildSectionContext(),
			pathResolver: this.pathResolver,
			settings: this.settings
		});
	}

	public override async setControlValue(key: string, value: unknown): Promise<void> {
		switch (key) {
			case 'attachmentBase':
				this.settings.attachmentBase = value as AttachmentBase;
				break;
			case 'deleteSourceAfterUpload':
				this.settings.deleteSourceAfterUpload = Boolean(value);
				break;
			case 'linkStyle':
				this.settings.linkStyle = value as LinkStyle;
				break;
			case 'localPathTemplate':
				this.settings.localPathTemplate = String(value);
				break;
			default:
				return;
		}
		await this.saveSettings();
		if (key === 'attachmentBase') {
			this.update();
		}
	}

	private applyProfileDraft(profileId: string): void {
		const draft = this.profileDrafts.get(profileId);
		const profile = this.settings.profiles.find((item) => item.id === profileId);
		if (!draft || !profile) {
			return;
		}
		Object.assign(profile, cloneProfile(draft));
		this.profileDrafts.set(profileId, cloneProfile(profile));
	}

	private buildSectionContext(): S3SectionContext {
		return {
			app: this.app,
			applyProfileDraft: (profileId: string): void => {
				this.applyProfileDraft(profileId);
			},
			expandedProfileIds: this.expandedProfileIds,
			getProfileDraft: (profile: StorageProfile): StorageProfile => this.getProfileDraft(profile),
			pathResolver: this.pathResolver,
			persist: (): void => {
				this.persist();
			},
			persistAndRedisplay: (): void => {
				this.persistAndRedisplay();
			},
			profileDrafts: this.profileDrafts,
			redisplay: (): void => {
				this.update();
			},
			registry: this.registry,
			settings: this.settings,
			toggleProfileExpanded: (profileId: string): void => {
				this.toggleProfileExpanded(profileId);
			}
		};
	}

	private getProfileDraft(profile: StorageProfile): StorageProfile {
		const existing = this.profileDrafts.get(profile.id);
		if (existing) {
			return existing;
		}
		const draft = cloneProfile(profile);
		this.profileDrafts.set(profile.id, draft);
		return draft;
	}

	private persist(): void {
		this.saveSettings().catch((error: unknown) => {
			console.error('Failed to save LanTai settings', error);
		});
	}

	private persistAndRedisplay(): void {
		this.saveAndRedisplay().catch((error: unknown) => {
			console.error('Failed to save LanTai settings', error);
		});
	}

	private async saveAndRedisplay(): Promise<void> {
		await this.saveSettings();
		this.update();
	}

	private toggleProfileExpanded(profileId: string): void {
		if (this.expandedProfileIds.has(profileId)) {
			this.expandedProfileIds.delete(profileId);
			this.profileDrafts.delete(profileId);
		} else {
			this.expandedProfileIds.add(profileId);
		}
		this.update();
	}
}

/** Pure builder used by the settings tab and unit tests. */
export function buildLanTaiSettingDefinitions(
	params: BuildLanTaiSettingDefinitionsParams
): SettingDefinitionItem[] {
	const { pathResolver, settings } = params;

	return [
		{
			heading: t('settings.general'),
			items: [
				{
					control: {
						key: 'attachmentBase',
						options: {
							note: t('settings.currentNoteFolder'),
							vault: t('settings.vaultRoot')
						},
						type: 'dropdown'
					},
					desc: t('settings.attachmentBaseDesc'),
					name: t('settings.attachmentBase')
				},
				{
					name: t('settings.localPathTemplate'),
					render: (setting: Setting): void => {
						renderLocalPathTemplate(setting, pathResolver, settings, (): void => {
							params.buildSectionContext().persist();
						});
					}
				},
				{
					control: {
						key: 'linkStyle',
						options: {
							markdown: t('settings.markdown'),
							wiki: t('settings.wiki')
						},
						type: 'dropdown'
					},
					desc: t('settings.linkStyleDesc'),
					name: t('settings.linkStyle')
				}
			],
			type: 'group'
		},
		{
			heading: t('settings.s3'),
			items: [
				{
					aliases: [
						t('settings.newProfile'),
						t('settings.emptyProfiles'),
						t('settings.profileName')
					],
					name: t('settings.s3Profiles'),
					render: (setting: Setting): void => {
						const host = setting.settingEl;
						host.empty();
						host.addClass('lantai-s3-settings-host');
						displayS3SectionBody(host, params.buildSectionContext());
					}
				},
				{
					control: {
						key: 'deleteSourceAfterUpload',
						type: 'toggle'
					},
					desc: t('settings.deleteSourceAfterUploadDesc'),
					name: t('settings.deleteSourceAfterUpload')
				}
			],
			type: 'group'
		}
	];
}

function cloneProfile(profile: StorageProfile): StorageProfile {
	return { ...profile };
}

function localPathTemplateDesc(
	pathResolver: AttachmentPathResolver,
	settings: PluginSettings,
	template: string
): string {
	try {
		const preview = pathResolver.resolveLocalPath({
			base: settings.attachmentBase,
			ctx: previewContext(),
			noteFolderPath: 'Notes',
			template
		});
		return t('settings.preview', { path: preview });
	} catch (error) {
		const message = error instanceof Error ? error.message : t('settings.invalidTemplate');
		return t('settings.invalidTemplateWithMessage', { message });
	}
}

function renderLocalPathTemplate(
	setting: Setting,
	pathResolver: AttachmentPathResolver,
	settings: PluginSettings,
	persist: () => void
): void {
	setting
		.setDesc(localPathTemplateDesc(pathResolver, settings, settings.localPathTemplate))
		.setClass('lantai-path-template');
	attachTokenInfoButton(setting.nameEl);
	setting.addText((text) => {
		text.setValue(settings.localPathTemplate).onChange((value) => {
			settings.localPathTemplate = value;
			setting.setDesc(localPathTemplateDesc(pathResolver, settings, value));
			persist();
		});
	});
}
