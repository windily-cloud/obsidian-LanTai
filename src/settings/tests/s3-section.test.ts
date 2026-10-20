import type { App } from 'obsidian';

import { fromPartial } from '@total-typescript/shoehorn';
import { SecretComponent } from 'obsidian';
import {
	afterEach,
	describe,
	expect,
	it,
	vi
} from 'vitest';

import type { LanTaiAccountSectionContext } from '../sections/lantai/lantai-account-section.ts';
import type { S3SectionContext } from '../sections/s3/s3-section.ts';
import type { StorageProfile } from '../sections/s3/storage-profile.ts';

import { AttachmentPathResolver } from '../../path/attachment-path-resolver.ts';
import { NameTemplateEngine } from '../../path/name-template-engine.ts';
import { StorageProfileRegistry } from '../helpers/storage-profile-registry.ts';
import { PluginSettings } from '../plugin-settings.ts';
import { displayS3SectionBody } from '../sections/s3/s3-section.ts';

describe('displayS3SectionBody', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('writes the selected secret names into the profile draft', () => {
		const settings = new PluginSettings();
		const profile = createProfile();
		settings.profiles = [profile];
		settings.activeProfileId = profile.id;
		const registry = new StorageProfileRegistry(settings);
		const draft = { ...profile };
		const onChangeSpy = vi.spyOn(SecretComponent.prototype, 'onChange');

		displayS3SectionBody(
			document.body.createDiv(),
			createSectionContext(settings, registry, profile, draft)
		);

		const accessKeyHandler = onChangeSpy.mock.calls[0]?.[0];
		accessKeyHandler?.('my-access-key');
		expect(draft.accessKeyIdSecretName).toBe('my-access-key');

		const secretAccessKeyHandler = onChangeSpy.mock.calls[1]?.[0];
		secretAccessKeyHandler?.('my-secret-access-key');
		expect(draft.secretAccessKeySecretName).toBe('my-secret-access-key');
	});
});

function createProfile(): StorageProfile {
	return {
		accessKeyIdSecretName: 'profile-access-key-id',
		bucket: 'bucket',
		id: 'profile-1',
		name: 'Test profile',
		// eslint-disable-next-line no-template-curly-in-string -- name-template token syntax
		objectKeyTemplate: 'images/${originalName}.${ext}',
		provider: 's3',
		publicBaseUrl: 'https://cdn.example.com',
		region: 'us-east-1',
		secretAccessKeySecretName: 'profile-secret-access-key'
	};
}

function createSectionContext(
	settings: PluginSettings,
	registry: StorageProfileRegistry,
	profile: StorageProfile,
	draft: StorageProfile
): S3SectionContext {
	return {
		app: fromPartial<App>({}),
		applyProfileDraft(_profileId: string): void {
			return undefined;
		},
		expandedProfileIds: new Set([profile.id]),
		getProfileDraft(_profile: StorageProfile): StorageProfile {
			return draft;
		},
		lanTaiAccount: fromPartial<LanTaiAccountSectionContext>({}),
		pathResolver: new AttachmentPathResolver(new NameTemplateEngine()),
		persist(): void {
			return undefined;
		},
		persistAndRedisplay(): void {
			return undefined;
		},
		profileDrafts: new Map([[profile.id, draft]]),
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
