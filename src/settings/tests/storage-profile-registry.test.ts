import {
	describe,
	expect,
	it
} from 'vitest';

import type { StorageProfile } from '../sections/s3/storage-profile.ts';

import { StorageProfileRegistry } from '../helpers/storage-profile-registry.ts';
import { PluginSettings } from '../plugin-settings.ts';

function makeProfile(overrides: Partial<StorageProfile> = {}): StorageProfile {
	return {
		accessKeyIdSecretName: 'ak',
		bucket: 'my-bucket',
		id: 'p1',
		name: 'Profile 1',
		// eslint-disable-next-line no-template-curly-in-string -- name-template token syntax
		objectKeyTemplate: 'images/${originalName}.${ext}',
		provider: 's3',
		publicBaseUrl: 'https://cdn.example.com',
		region: 'us-east-1',
		secretAccessKeySecretName: 'sk',
		...overrides
	};
}

describe('StorageProfileRegistry', () => {
	it('returns active profile after setActive', () => {
		const settings = new PluginSettings();
		const reg = new StorageProfileRegistry(settings);
		const p = makeProfile({ id: 'p1', publicBaseUrl: 'https://cdn.example.com' });
		reg.add(p);
		reg.setActive('p1');
		expect(reg.getActive()?.id).toBe('p1');
	});

	it('assertReadyForUpload rejects empty publicBaseUrl', () => {
		const reg = new StorageProfileRegistry(new PluginSettings());
		const profile = makeProfile({ publicBaseUrl: '' });
		expect(() => {
			reg.assertReadyForUpload(profile);
		}).toThrow(/publicBaseUrl/i);
	});

	it('starts with no profiles and no active profile', () => {
		const settings = new PluginSettings();
		const reg = new StorageProfileRegistry(settings);
		expect(reg.list()).toEqual([]);
		expect(reg.getActive()).toBeNull();
	});

	it('removes a lantai profile like any other', () => {
		const settings = new PluginSettings();
		const reg = new StorageProfileRegistry(settings);
		reg.add(makeProfile({ id: 'lantai', name: '兰台', provider: 'lantai' }));
		reg.add(makeProfile({ id: 'oss', name: '阿里云' }));
		reg.setActive('lantai');

		reg.remove('lantai');
		expect(reg.list().map((profile) => profile.id)).toEqual(['oss']);
		expect(reg.getActive()?.id).toBe('oss');
	});
});
