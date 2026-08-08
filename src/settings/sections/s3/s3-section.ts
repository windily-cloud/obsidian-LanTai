import {
	SecretComponent,
	Setting
} from 'obsidian';

import type { StorageProfileRegistry } from '../../helpers/storage-profile-registry.ts';
import type {
	StorageProfileFieldKey,
	StorageProviderField
} from '../../helpers/storage-provider-fields.ts';
import type { SettingsSectionContext } from '../settings-section-context.ts';
import type {
	StorageProfile,
	StorageProvider
} from './storage-profile.ts';

import {
	attachTokenInfoButton,
	previewContext
} from '../../helpers/path-template-ui.ts';
import { addSectionHeading } from '../../helpers/section-heading.ts';
import { StorageProviderFields } from '../../helpers/storage-provider-fields.ts';

interface S3SectionContext extends SettingsSectionContext {
	applyProfileDraft(profileId: string): void;
	readonly expandedProfileIds: Set<string>;
	getProfileDraft(profile: StorageProfile): StorageProfile;
	readonly profileDrafts: Map<string, StorageProfile>;
	readonly registry: StorageProfileRegistry;
	toggleProfileExpanded(profileId: string): void;
}

const PROVIDER_NAMES: Record<StorageProvider, string> = {
	alibaba: 'Alibaba Cloud OSS',
	r2: 'Cloudflare R2',
	s3: 'AWS S3',
	s3Compatible: 'S3-compatible custom',
	tencent: 'Tencent Cloud COS'
};

export function displayS3Section(containerEl: HTMLElement, ctx: S3SectionContext): void {
	addSectionHeading(containerEl, 'S3', 'cloud');

	const profiles = ctx.registry.list();
	new Setting(containerEl)
		.setName('S3 storage profiles')
		.addDropdown((dropdown) => {
			dropdown.addOption('', 'Select profile');
			for (const profile of profiles) {
				dropdown.addOption(profile.id, profile.name || 'Untitled profile');
			}
			dropdown
				.setValue(ctx.settings.activeProfileId ?? '')
				.setDisabled(profiles.length === 0)
				.onChange((value) => {
					if (value) {
						ctx.registry.setActive(value);
					} else {
						ctx.settings.activeProfileId = null;
					}
					ctx.persistAndRedisplay();
				});
		})
		.addButton((button) => {
			button.setButtonText('New').setCta().onClick(() => {
				const profile = createProfile();
				ctx.registry.add(profile);
				ctx.expandedProfileIds.add(profile.id);
				ctx.persistAndRedisplay();
			});
		});

	if (profiles.length === 0) {
		containerEl.createEl('p', {
			text: 'Create a storage profile to enable uploads.'
		});
	} else {
		for (const profile of profiles) {
			displayProfileCard(containerEl, ctx, profile);
		}
	}

	new Setting(containerEl)
		.setName('Delete source after upload')
		.setDesc('Move the local source image to the Obsidian trash after a successful upload.')
		.addToggle((toggle) => {
			toggle
				.setValue(ctx.settings.deleteSourceAfterUpload)
				.onChange((value) => {
					ctx.settings.deleteSourceAfterUpload = value;
					ctx.persist();
				});
		});
}

function createProfile(): StorageProfile {
	const randomPart = String(Math.random()).replace('0.', '');
	const id = `profile-${String(Date.now())}-${randomPart}`;
	return {
		accessKeyIdSecretName: `lantai-${id}-access-key-id`,
		bucket: '',
		id,
		name: 'New profile',
		// eslint-disable-next-line no-template-curly-in-string -- name-template token syntax
		objectKeyTemplate: 'images/${originalName}.${ext}',
		provider: 's3',
		publicBaseUrl: '',
		secretAccessKeySecretName: `lantai-${id}-secret-access-key`
	};
}

function displayObjectKeyTemplateField(
	parentEl: HTMLElement,
	ctx: S3SectionContext,
	draft: StorageProfile
): void {
	const setting = new Setting(parentEl)
		.setName('Object key template')
		.setDesc(objectKeyTemplateDesc(ctx, draft.objectKeyTemplate))
		.setClass('lantai-path-template');
	attachTokenInfoButton(setting.nameEl);
	setting.addText((text) => {
		text.setValue(draft.objectKeyTemplate).onChange((value) => {
			draft.objectKeyTemplate = value;
			setting.setDesc(objectKeyTemplateDesc(ctx, value));
		});
	});
}

function displayProfileBody(
	parentEl: HTMLElement,
	ctx: S3SectionContext,
	profile: StorageProfile
): void {
	const draft = ctx.getProfileDraft(profile);
	const isActive = ctx.settings.activeProfileId === profile.id;

	new Setting(parentEl).setName('Profile name').addText((text) => {
		text.setValue(draft.name).onChange((value) => {
			draft.name = value;
		});
	});
	new Setting(parentEl).setName('Provider').addDropdown((dropdown) => {
		for (const provider of Object.keys(PROVIDER_NAMES) as StorageProvider[]) {
			dropdown.addOption(provider, PROVIDER_NAMES[provider]);
		}
		dropdown.setValue(draft.provider).onChange((value) => {
			draft.provider = value as StorageProvider;
			ctx.redisplay();
		});
	});
	for (const field of StorageProviderFields.fieldsFor(draft.provider)) {
		displayProfileField(parentEl, ctx, draft, field);
	}

	const actions = new Setting(parentEl);
	if (!isActive) {
		actions.addButton((button) => {
			button.setButtonText('Set as active').onClick(() => {
				ctx.registry.setActive(profile.id);
				ctx.persistAndRedisplay();
			});
		});
	}
	actions.addButton((button) => {
		button
			.setButtonText('Delete')
			.setWarning()
			.onClick(() => {
				ctx.expandedProfileIds.delete(profile.id);
				ctx.profileDrafts.delete(profile.id);
				ctx.registry.remove(profile.id);
				ctx.persistAndRedisplay();
			});
	});
	actions.addButton((button) => {
		button.setButtonText('Save').setCta().onClick(() => {
			ctx.applyProfileDraft(profile.id);
			ctx.persistAndRedisplay();
		});
	});
}

function displayProfileCard(
	containerEl: HTMLElement,
	ctx: S3SectionContext,
	profile: StorageProfile
): void {
	const isActive = ctx.settings.activeProfileId === profile.id;
	const isExpanded = ctx.expandedProfileIds.has(profile.id);
	const cardEl = containerEl.createDiv({
		cls: [
			'lantai-profile',
			isExpanded ? 'is-expanded' : 'is-collapsed',
			isActive ? 'is-active' : ''
		]
			.filter(Boolean)
			.join(' ')
	});

	const header = new Setting(cardEl)
		.setName(profile.name || 'Untitled profile')
		.setDesc(
			[PROVIDER_NAMES[profile.provider], isActive ? 'Active' : null]
				.filter(Boolean)
				.join(' · ')
		)
		.setClass('lantai-profile-header');

	header.settingEl.addEventListener('click', (event) => {
		const target = event.target;
		if (!(target instanceof HTMLElement)) {
			return;
		}
		if (target.closest('.setting-item-control')) {
			return;
		}
		ctx.toggleProfileExpanded(profile.id);
	});

	header.addExtraButton((button) => {
		button
			.setIcon(isExpanded ? 'chevron-down' : 'chevron-right')
			.setTooltip(isExpanded ? 'Collapse' : 'Expand')
			.onClick(() => {
				ctx.toggleProfileExpanded(profile.id);
			});
	});

	if (isExpanded) {
		const bodyEl = cardEl.createDiv({ cls: 'lantai-profile-body' });
		displayProfileBody(bodyEl, ctx, profile);
	}
}

function displayProfileField(
	parentEl: HTMLElement,
	ctx: S3SectionContext,
	draft: StorageProfile,
	field: StorageProviderField
): void {
	if (field.secret) {
		displaySecretField(parentEl, ctx, draft, field);
		return;
	}
	if (field.key === 'objectKeyTemplate') {
		displayObjectKeyTemplateField(parentEl, ctx, draft);
		return;
	}
	const setting = new Setting(parentEl)
		.setName(field.label)
		.setDesc(field.required ? 'Required.' : 'Optional.');
	if (field.key === 'forcePathStyle') {
		setting.addToggle((toggle) => {
			toggle.setValue(draft.forcePathStyle ?? true).onChange((value) => {
				draft.forcePathStyle = value;
			});
		});
		return;
	}
	setting.addText((text) => {
		text.setValue(readStringField(draft, field.key)).onChange((value) => {
			writeStringField(draft, field.key, value);
		});
	});
}

function displaySecretField(
	parentEl: HTMLElement,
	ctx: S3SectionContext,
	draft: StorageProfile,
	field: StorageProviderField
): void {
	new Setting(parentEl)
		.setName(field.label)
		.setDesc(field.required ? 'Required.' : 'Optional.')
		.addComponent((el) =>
			new SecretComponent(ctx.app, el)
				.setValue(readStringField(draft, field.key))
				.onChange((value) => {
					writeStringField(draft, field.key, value ?? '');
				})
		);
}

function objectKeyTemplateDesc(ctx: S3SectionContext, template: string): string {
	try {
		const preview = ctx.pathResolver.resolveObjectKey({
			ctx: previewContext(),
			template
		});
		return `Preview: ${preview}`;
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Invalid template';
		return `Invalid template: ${message}`;
	}
}

function readStringField(profile: StorageProfile, key: StorageProfileFieldKey): string {
	switch (key) {
		case 'accessKeyIdSecretName':
		case 'bucket':
		case 'objectKeyTemplate':
		case 'publicBaseUrl':
		case 'secretAccessKeySecretName':
			return profile[key];
		case 'accountId':
		case 'endpoint':
		case 'region':
			return profile[key] ?? '';
		case 'forcePathStyle':
			return String(profile.forcePathStyle ?? true);
		default: {
			const _exhaustive: never = key;
			return _exhaustive;
		}
	}
}

function writeStringField(
	profile: StorageProfile,
	key: StorageProfileFieldKey,
	value: string
): void {
	switch (key) {
		case 'accessKeyIdSecretName':
		case 'bucket':
		case 'objectKeyTemplate':
		case 'publicBaseUrl':
		case 'secretAccessKeySecretName':
			profile[key] = value;
			break;
		case 'accountId':
		case 'endpoint':
		case 'region':
			profile[key] = value;
			break;
		case 'forcePathStyle':
			profile.forcePathStyle = value === 'true';
			break;
		default: {
			const _exhaustive: never = key;
			return _exhaustive;
		}
	}
}
