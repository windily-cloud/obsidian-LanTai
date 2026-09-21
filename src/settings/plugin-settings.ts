import type {
	App,
	Plugin,
	SettingDefinitionItem
} from 'obsidian';

import {
	Platform,
	PluginSettingTab,
	Setting
} from 'obsidian';

import type { LanTaiAccountClient } from '../lantai/lantai-account.ts';
import type { AttachmentPathResolver } from '../path/attachment-path-resolver.ts';
import type { LanTaiAccountSectionContext } from './sections/lantai/lantai-account-section.ts';
import type { S3SectionContext } from './sections/s3/s3-section.ts';
import type { StorageProfile } from './sections/s3/storage-profile.ts';

import { t } from '../i18n/index.ts';
import {
	attachTokenInfoButton,
	previewContext
} from './helpers/path-template-ui.ts';
import { StorageProfileRegistry } from './helpers/storage-profile-registry.ts';
import { displayMigrationSection } from './sections/migration-section.ts';
import { displayS3SectionBody } from './sections/s3/s3-section.ts';
// Stub sections (image processing / operations) — re-enable when implemented.
export type AttachmentBase = 'note' | 'vault';
/** 兰台账号段需要的外部依赖（SecretStorage、打开链接）。注入到存储配置档卡片内。 */
export interface LanTaiAccountTabDeps {
	readonly client: LanTaiAccountClient;
	getApiKey(): null | string;
	openUrl(url: string): void;
	setApiKey(value: null | string): void;
}

export type LinkStyle = 'markdown' | 'wiki';

interface BuildLanTaiSettingDefinitionsParams {
	buildSectionContext(): S3SectionContext;
	readonly isMobile?: boolean;
	openMigration?(): void;
	readonly pathResolver: AttachmentPathResolver;
	readonly settings: PluginSettings;
}

type PersistPluginSettings = () => Promise<void>;

interface PluginSettingsTabConstructorParams {
	readonly app: App;
	readonly lanTai: LanTaiAccountTabDeps;
	openMigration(): void;
	readonly pathResolver: AttachmentPathResolver;
	readonly plugin: Plugin;
	readonly saveSettings: PersistPluginSettings;
	readonly settings: PluginSettings;
}

interface SettingsTabRefreshTarget {
	display(): void;
	update?(): void;
}

export class PluginSettings {
	public activeProfileId: null | string = null;
	public attachmentBase: AttachmentBase = 'note';
	public deleteSourceAfterUpload = false;
	public linkStyle: LinkStyle = 'wiki';
	// eslint-disable-next-line no-template-curly-in-string -- name-template token syntax
	public localPathTemplate = '${originalName}.${ext}';
	public profiles: StorageProfile[] = [];
}

export class PluginSettingsTab extends PluginSettingTab {
	private readonly expandedProfileIds = new Set<string>();
	private readonly lanTai: LanTaiAccountTabDeps;
	private readonly openMigration: () => void;
	private readonly pathResolver: AttachmentPathResolver;
	private readonly profileDrafts = new Map<string, StorageProfile>();
	private readonly registry: StorageProfileRegistry;
	private readonly saveSettings: () => Promise<void>;
	private readonly settings: PluginSettings;

	public constructor(params: PluginSettingsTabConstructorParams) {
		super(params.app, params.plugin);
		this.lanTai = params.lanTai;
		this.openMigration = (): void => {
			params.openMigration();
		};
		this.pathResolver = params.pathResolver;
		this.registry = new StorageProfileRegistry(params.settings);
		this.saveSettings = (): Promise<void> => params.saveSettings();
		this.settings = params.settings;
	}

	public override display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName(t('settings.general')).setHeading();
		new Setting(containerEl)
			.setName(t('settings.attachmentBase'))
			.setDesc(t('settings.attachmentBaseDesc'))
			.addDropdown((dropdown) => {
				dropdown
					.addOption('note', t('settings.currentNoteFolder'))
					.addOption('vault', t('settings.vaultRoot'))
					.setValue(this.settings.attachmentBase)
					.onChange((value) => {
						this.settings.attachmentBase = value as AttachmentBase;
						this.persistAndRedisplay();
					});
			});
		renderLocalPathTemplate(
			new Setting(containerEl).setName(t('settings.localPathTemplate')),
			this.pathResolver,
			this.settings,
			(): void => {
				this.persist();
			}
		);
		new Setting(containerEl)
			.setName(t('settings.linkStyle'))
			.setDesc(t('settings.linkStyleDesc'))
			.addDropdown((dropdown) => {
				dropdown
					.addOption('markdown', t('settings.markdown'))
					.addOption('wiki', t('settings.wiki'))
					.setValue(this.settings.linkStyle)
					.onChange((value) => {
						this.settings.linkStyle = value as LinkStyle;
						this.persist();
					});
			});

		new Setting(containerEl).setName(t('settings.s3')).setHeading();
		displayS3SectionBody(
			containerEl.createDiv('lantai-s3-settings-host'),
			this.buildSectionContext()
		);
		new Setting(containerEl)
			.setName(t('settings.deleteSourceAfterUpload'))
			.setDesc(t('settings.deleteSourceAfterUploadDesc'))
			.addToggle((toggle) => {
				toggle.setValue(this.settings.deleteSourceAfterUpload).onChange((value) => {
					this.settings.deleteSourceAfterUpload = value;
					this.persist();
				});
			});
		displayMigrationSection(containerEl, this.openMigration, Platform.isMobile);
	}

	public override getControlValue(key: string): unknown {
		return this.settings[key as keyof PluginSettings];
	}

	public override getSettingDefinitions(): SettingDefinitionItem[] {
		return buildLanTaiSettingDefinitions({
			buildSectionContext: (): S3SectionContext => this.buildSectionContext(),
			isMobile: Platform.isMobile,
			openMigration: (): void => {
				this.openMigration();
			},
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
			this.refreshTab();
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

	private buildLanTaiAccountContext(): LanTaiAccountSectionContext {
		return {
			app: this.app,
			client: this.lanTai.client,
			getApiKey: (): null | string => this.lanTai.getApiKey(),
			openUrl: (url: string): void => {
				this.lanTai.openUrl(url);
			},
			redisplay: (): void => {
				this.refreshTab();
			},
			setApiKey: (value: null | string): void => {
				this.lanTai.setApiKey(value);
			}
		};
	}

	private buildSectionContext(): S3SectionContext {
		return {
			app: this.app,
			applyProfileDraft: (profileId: string): void => {
				this.applyProfileDraft(profileId);
			},
			expandedProfileIds: this.expandedProfileIds,
			getProfileDraft: (profile: StorageProfile): StorageProfile => this.getProfileDraft(profile),
			lanTaiAccount: this.buildLanTaiAccountContext(),
			pathResolver: this.pathResolver,
			persist: (): void => {
				this.persist();
			},
			persistAndRedisplay: (): void => {
				this.persistAndRedisplay();
			},
			profileDrafts: this.profileDrafts,
			redisplay: (): void => {
				this.refreshTab();
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

	private refreshTab(): void {
		refreshSettingsTab(this);
	}

	private async saveAndRedisplay(): Promise<void> {
		await this.saveSettings();
		this.refreshTab();
	}

	private toggleProfileExpanded(profileId: string): void {
		if (this.expandedProfileIds.has(profileId)) {
			this.expandedProfileIds.delete(profileId);
			this.profileDrafts.delete(profileId);
		} else {
			this.expandedProfileIds.add(profileId);
		}
		this.refreshTab();
	}
}

/** Pure builder used by the settings tab and unit tests. */
export function buildLanTaiSettingDefinitions(
	params: BuildLanTaiSettingDefinitionsParams
): SettingDefinitionItem[] {
	const { pathResolver, settings } = params;
	const groups: SettingDefinitionItem[] = [
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
						t('settings.emptyProfiles'),
						t('settings.lantaiAccount'),
						t('settings.lantaiApiKey'),
						t('settings.lantaiGetKey'),
						t('settings.newProfile'),
						t('settings.profileName'),
						t('settings.providerLantai')
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
	if (params.isMobile !== true) {
		groups.push({
			heading: t('migration.section'),
			items: [
				{
					desc: t('migration.sectionDesc'),
					name: t('migration.start'),
					render: (setting: Setting): void => {
						setting.addButton((button) =>
							button.setButtonText(t('migration.start')).setCta().onClick(() => {
								params.openMigration?.();
							})
						);
					}
				}
			],
			type: 'group'
		});
	}
	return groups;
}

/** 1.13+ uses `update()`; 1.11.4–1.12 only have `display()`. */
export function refreshSettingsTab(tab: SettingsTabRefreshTarget): void {
	if (typeof tab.update === 'function') {
		tab.update();
		return;
	}
	tab.display();
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
