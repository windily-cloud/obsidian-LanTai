import type {
	App,
	Plugin
} from 'obsidian';

import { PluginSettingTab } from 'obsidian';

import type { AttachmentPathResolver } from '../path/attachment-path-resolver.ts';
import type { StorageProfile } from './sections/s3/storage-profile.ts';

import { StorageProfileRegistry } from './helpers/storage-profile-registry.ts';
import { displayGeneralSection } from './sections/general-section.ts';
import { displayImageOperationsSection } from './sections/image-operations-section.ts';
import { displayImageProcessingSection } from './sections/image-processing-section.ts';
import { displayS3Section } from './sections/s3/s3-section.ts';

export type AttachmentBase = 'note' | 'vault';
export type LinkStyle = 'markdown' | 'wiki';

export type PersistPluginSettings = () => Promise<void>;

export interface PluginSettingsTabConstructorParams {
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

	public override display(): void {
		this.renderSettings();
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

	private renderSettings(): void {
		this.containerEl.empty();

		const ctx = {
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
				this.renderSettings();
			},
			registry: this.registry,
			settings: this.settings,
			toggleProfileExpanded: (profileId: string): void => {
				this.toggleProfileExpanded(profileId);
			}
		};

		displayGeneralSection(this.containerEl, ctx);
		displayS3Section(this.containerEl, ctx);
		displayImageProcessingSection(this.containerEl);
		displayImageOperationsSection(this.containerEl);
	}

	private async saveAndRedisplay(): Promise<void> {
		await this.saveSettings();
		this.renderSettings();
	}

	private toggleProfileExpanded(profileId: string): void {
		if (this.expandedProfileIds.has(profileId)) {
			this.expandedProfileIds.delete(profileId);
			this.profileDrafts.delete(profileId);
		} else {
			this.expandedProfileIds.add(profileId);
		}
		this.renderSettings();
	}
}

function cloneProfile(profile: StorageProfile): StorageProfile {
	return { ...profile };
}
