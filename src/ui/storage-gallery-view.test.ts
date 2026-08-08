import {
	describe,
	expect,
	it
} from 'vitest';

import type { StorageProfile } from '../settings/sections/s3/storage-profile.ts';

import {
	getObjectFileName,
	selectGalleryProfile
} from './storage-gallery-view.ts';

describe('storage gallery helpers', () => {
	it('uses the independent gallery profile before the active profile', () => {
		const active = profile('active', 'Active');
		const gallery = profile('gallery', 'Gallery');

		expect(selectGalleryProfile([active, gallery], 'gallery', 'active')).toBe(gallery);
	});

	it('falls back to the active profile when the gallery profile no longer exists', () => {
		const active = profile('active', 'Active');

		expect(selectGalleryProfile([active], 'deleted', 'active')).toBe(active);
	});

	it('extracts the image name from an object key', () => {
		expect(getObjectFileName('notes/2026/cat photo.png')).toBe('cat photo.png');
		expect(getObjectFileName('cat.png')).toBe('cat.png');
	});
});

function profile(id: string, name: string): StorageProfile {
	return {
		accessKeyIdSecretName: `${id}-access-key`,
		bucket: id,
		id,
		name,
		// eslint-disable-next-line no-template-curly-in-string -- name-template token syntax.
		objectKeyTemplate: '${originalName}.${ext}',
		provider: 's3',
		publicBaseUrl: `https://${id}.example.com`,
		secretAccessKeySecretName: `${id}-secret-key`
	};
}
