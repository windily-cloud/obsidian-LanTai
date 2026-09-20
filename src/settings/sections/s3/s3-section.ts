import {
	Notice,
	requestUrl,
	SecretComponent,
	Setting
} from 'obsidian';

import type {
	ConnectionCheckId,
	StorageConnectionTestReport
} from '../../../storage/test-storage-connection.ts';
import type { StorageProfileRegistry } from '../../helpers/storage-profile-registry.ts';
import type {
	StorageProfileFieldKey,
	StorageProviderField
} from '../../helpers/storage-provider-fields.ts';
import type { LanTaiAccountSectionContext } from '../lantai/lantai-account-section.ts';
import type { SettingsSectionContext } from '../settings-section-context.ts';
import type {
	StorageProfile,
	StorageProvider
} from './storage-profile.ts';

import { t } from '../../../i18n/index.ts';
import { createObjectStorageFactory } from '../../../storage/object-storage-factory.ts';
import { RequestUrlObjectStorageTransport } from '../../../storage/request-url-object-storage-transport.ts';
import { testStorageConnection } from '../../../storage/test-storage-connection.ts';
import { confirmAction } from '../../../ui/confirm-modal.ts';
import {
	attachTokenInfoButton,
	previewContext
} from '../../helpers/path-template-ui.ts';
import { StorageProviderFields } from '../../helpers/storage-provider-fields.ts';
import { displayLanTaiAccountSection } from '../lantai/lantai-account-section.ts';

export interface S3SectionContext extends SettingsSectionContext {
	applyProfileDraft(profileId: string): void;
	readonly expandedProfileIds: Set<string>;
	getProfileDraft(profile: StorageProfile): StorageProfile;
	readonly lanTaiAccount: LanTaiAccountSectionContext;
	readonly profileDrafts: Map<string, StorageProfile>;
	readonly registry: StorageProfileRegistry;
	toggleProfileExpanded(profileId: string): void;
}

interface ConnectionTestButton {
	setButtonText(text: string): unknown;
	setDisabled(disabled: boolean): unknown;
}

export function displayS3SectionBody(containerEl: HTMLElement, ctx: S3SectionContext): void {
	if (ctx.registry.ensureLanTai()) {
		ctx.persist();
	}
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

function confirmDeleteProfile(ctx: S3SectionContext, profile: StorageProfile): Promise<void> {
	const name = profile.name || t('settings.untitledProfile');
	return confirmAction({
		app: ctx.app,
		confirmText: t('settings.delete'),
		message: t('settings.deleteProfileConfirm', { name }),
		title: t('settings.deleteProfileTitle'),
		warning: true
	}).then((confirmed) => {
		if (!confirmed) {
			return;
		}
		ctx.expandedProfileIds.delete(profile.id);
		ctx.profileDrafts.delete(profile.id);
		ctx.registry.remove(profile.id);
		ctx.persistAndRedisplay();
	});
}

function connectionCheckLabel(id: ConnectionCheckId): string {
	switch (id) {
		case 'client':
			return t('settings.testCheckClient');
		case 'head':
			return t('settings.testCheckHead');
		case 'list':
			return t('settings.testCheckList');
		case 'secrets':
			return t('settings.testCheckSecrets');
		case 'upload':
			return t('settings.testCheckUpload');
		default: {
			const _exhaustive: never = id;
			return _exhaustive;
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

function displayConnectionTest(
	parentEl: HTMLElement,
	ctx: S3SectionContext,
	draft: StorageProfile
): void {
	const testSetting = new Setting(parentEl)
		.setName(t('settings.testConnection'))
		.setDesc('');
	testSetting.descEl.addClass('lantai-connection-test-desc');
	testSetting.addButton((button) => {
		button.setButtonText(t('settings.testConnection')).onClick(() => {
			runConnectionTest(ctx, draft, button, testSetting).catch((error: unknown) => {
				console.error('Connection test failed', error);
				new Notice(error instanceof Error ? error.message : t('settings.testConnectionFailed'));
			});
		});
	});
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
		for (const provider of providerOrder()) {
			// 库内至多一个 lantai 配置档：其它卡片不再提供该选项，当前卡片必须仍能选中。
			if (provider === 'lantai' && hasOtherLanTaiProfile(ctx.settings.profiles, profile.id)) {
				continue;
			}
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

	if (draft.provider === 'lantai') {
		displayLanTaiAccountSection(
			parentEl.createDiv('lantai-account-host'),
			ctx.lanTaiAccount
		);
	} else {
		displayConnectionTest(parentEl, ctx, draft);
	}

	const actions = new Setting(parentEl);
	if (!isActive) {
		actions.addButton((button) => {
			button.setButtonText(t('settings.setAsActive'));
			if (draft.provider === 'lantai') {
				button.setCta();
			}
			button.onClick(() => {
				ctx.registry.setActive(profile.id);
				ctx.persistAndRedisplay();
			});
		});
	}
	if (profile.provider !== 'lantai') {
		actions.addButton((button) => {
			button
				.setButtonText(t('settings.delete'))
				.setWarning()
				.onClick(() => {
					confirmDeleteProfile(ctx, profile).catch((error: unknown) => {
						console.error('Failed to delete storage profile', error);
					});
				});
		});
	}
	actions.addButton((button) => {
		button.setButtonText(t('settings.save'));
		if (!(draft.provider === 'lantai' && !isActive)) {
			button.setCta();
		}
		button.onClick(() => {
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

function hasOtherLanTaiProfile(profiles: readonly StorageProfile[], exceptId: string): boolean {
	return profiles.some((item) => item.provider === 'lantai' && item.id !== exceptId);
}

function localizeConnectionReport(report: StorageConnectionTestReport): string {
	return report.checks
		.map((check) => {
			const label = connectionCheckLabel(check.id);
			let mark: string;
			if (check.status === 'pass') {
				mark = '✓';
			} else if (check.status === 'skip') {
				mark = '–';
			} else {
				mark = '✗';
			}
			return check.detail ? `${mark} ${label}: ${check.detail}` : `${mark} ${label}`;
		})
		.join('\n');
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
		lantai: t('settings.providerLantai'),
		r2: t('settings.providerR2'),
		s3: t('settings.providerS3'),
		s3Compatible: t('settings.providerS3Compatible'),
		tencent: t('settings.providerTencent')
	};
}

function providerOrder(): StorageProvider[] {
	return [
		'lantai',
		...(Object.keys(providerNames()) as StorageProvider[]).filter((provider) => provider !== 'lantai')
	];
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

async function runConnectionTest(
	ctx: S3SectionContext,
	draft: StorageProfile,
	button: ConnectionTestButton,
	resultSetting: Setting
): Promise<void> {
	button.setDisabled(true);
	button.setButtonText(t('settings.testConnectionRunning'));
	resultSetting.setDesc(t('settings.testConnectionRunning'));
	try {
		const report = await testStorageConnection({
			createStorage: createObjectStorageFactory(
				new RequestUrlObjectStorageTransport({ requestUrl })
			),
			getSecret: (name): null | string => name ? ctx.app.secretStorage.getSecret(name) : null,
			profile: draft
		});
		const summary = localizeConnectionReport(report);
		resultSetting.setDesc(summary);
		new Notice(report.ok ? t('settings.testConnectionOk') : t('settings.testConnectionFailed'));
	} finally {
		button.setDisabled(false);
		button.setButtonText(t('settings.testConnection'));
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
