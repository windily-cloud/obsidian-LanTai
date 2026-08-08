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

import { t } from '../../../i18n/index.ts';
import {
	attachTokenInfoButton,
	previewContext
} from '../../helpers/path-template-ui.ts';
import { StorageProviderFields } from '../../helpers/storage-provider-fields.ts';

export interface S3SectionContext extends SettingsSectionContext {
	applyProfileDraft(profileId: string): void;
	readonly expandedProfileIds: Set<string>;
	getProfileDraft(profile: StorageProfile): StorageProfile;
	readonly profileDrafts: Map<string, StorageProfile>;
	readonly registry: StorageProfileRegistry;
	toggleProfileExpanded(profileId: string): void;
}

export function displayS3SectionBody(containerEl: HTMLElement, ctx: S3SectionContext): void {
	const profiles = ctx.registry.list();
	new Setting(containerEl)
		.setName(t('settings.s3Profiles'))
		.addDropdown((dropdown) => {
			dropdown.addOption('', t('settings.selectProfile'));
			for (const profile of profiles) {
				dropdown.addOption(profile.id, profile.name || t('settings.untitledProfile'));
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
			button.setButtonText(t('settings.new')).setCta().onClick(() => {
				const profile = createProfile();
				ctx.registry.add(profile);
				ctx.expandedProfileIds.add(profile.id);
				ctx.persistAndRedisplay();
			});
		});

	if (profiles.length === 0) {
		containerEl.createEl('p', {
			text: t('settings.emptyProfiles')
		});
	} else {
		for (const profile of profiles) {
			displayProfileCard(containerEl, ctx, profile);
		}
	}
}

function createProfile(): StorageProfile {
	const randomPart = String(Math.random()).replace('0.', '');
	const id = `profile-${String(Date.now())}-${randomPart}`;
	return {
		accessKeyIdSecretName: `lantai-${id}-access-key-id`,
		bucket: '',
		id,
		name: t('settings.newProfile'),
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
		.setName(t('settings.fieldObjectKeyTemplate'))
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

	new Setting(parentEl).setName(t('settings.profileName')).addText((text) => {
		text.setValue(draft.name).onChange((value) => {
			draft.name = value;
		});
	});
	new Setting(parentEl).setName(t('settings.provider')).addDropdown((dropdown) => {
		for (const provider of Object.keys(providerNames()) as StorageProvider[]) {
			dropdown.addOption(provider, providerNames()[provider]);
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
			button.setButtonText(t('settings.setAsActive')).onClick(() => {
				ctx.registry.setActive(profile.id);
				ctx.persistAndRedisplay();
			});
		});
	}
	actions.addButton((button) => {
		button
			.setButtonText(t('settings.delete'))
			.setWarning()
			.onClick(() => {
				ctx.expandedProfileIds.delete(profile.id);
				ctx.profileDrafts.delete(profile.id);
				ctx.registry.remove(profile.id);
				ctx.persistAndRedisplay();
			});
	});
	actions.addButton((button) => {
		button.setButtonText(t('settings.save')).setCta().onClick(() => {
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
		.setName(profile.name || t('settings.untitledProfile'))
		.setDesc(
			[providerNames()[profile.provider], isActive ? t('settings.active') : null]
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
			.setTooltip(isExpanded ? t('settings.collapse') : t('settings.expand'))
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
		.setDesc(field.required ? t('settings.required') : t('settings.optional'));
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
		.setDesc(field.required ? t('settings.required') : t('settings.optional'))
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
		return t('settings.preview', { path: preview });
	} catch (error) {
		const message = error instanceof Error ? error.message : t('settings.invalidTemplate');
		return t('settings.invalidTemplateWithMessage', { message });
	}
}

function providerNames(): Record<StorageProvider, string> {
	return {
		alibaba: t('settings.providerAlibaba'),
		r2: t('settings.providerR2'),
		s3: t('settings.providerS3'),
		s3Compatible: t('settings.providerS3Compatible'),
		tencent: t('settings.providerTencent')
	};
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
