import {
	describe,
	expect,
	it
} from 'vitest';

import {
	DEFAULT_GALLERY_SESSION,
	GALLERY_SESSION_VERSION,
	gallerySessionOrDefault,
	parseGallerySession
} from '../gallery-session.ts';

describe('parseGallerySession', () => {
	it('accepts a complete valid blob', () => {
		expect(parseGallerySession({
			layout: 'masonry',
			panelOpen: true,
			panelWidth: 400,
			profileId: 'p1',
			selectedKey: 'a.png',
			sortKey: 'name',
			sortOrder: 'asc',
			source: 'lantai',
			version: GALLERY_SESSION_VERSION
		})).toEqual({
			layout: 'masonry',
			panelOpen: true,
			panelWidth: 400,
			profileId: 'p1',
			selectedKey: 'a.png',
			sortKey: 'name',
			sortOrder: 'asc',
			source: 'lantai',
			version: GALLERY_SESSION_VERSION
		});
	});

	it('parses a JSON string', () => {
		expect(parseGallerySession(JSON.stringify(DEFAULT_GALLERY_SESSION))).toEqual(DEFAULT_GALLERY_SESSION);
	});

	it('rejects unknown version, enums, and out-of-range width', () => {
		expect(parseGallerySession({ ...DEFAULT_GALLERY_SESSION, version: 2 })).toBeNull();
		expect(parseGallerySession({ ...DEFAULT_GALLERY_SESSION, source: 's3' })).toBeNull();
		expect(parseGallerySession({ ...DEFAULT_GALLERY_SESSION, panelWidth: 100 })).toBeNull();
		expect(parseGallerySession({ ...DEFAULT_GALLERY_SESSION, selectedKey: 1 })).toBeNull();
		expect(parseGallerySession('not-json')).toBeNull();
	});
});

describe('gallerySessionOrDefault', () => {
	it('returns defaults and reset=true when invalid', () => {
		expect(gallerySessionOrDefault({ version: 99 })).toEqual({
			reset: true,
			session: DEFAULT_GALLERY_SESSION
		});
	});

	it('returns the parsed session when valid', () => {
		expect(gallerySessionOrDefault(DEFAULT_GALLERY_SESSION)).toEqual({
			reset: false,
			session: DEFAULT_GALLERY_SESSION
		});
	});
});
