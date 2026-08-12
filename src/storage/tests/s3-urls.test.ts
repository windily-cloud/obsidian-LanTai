import {
	describe,
	expect,
	it
} from 'vitest';

import {
	buildListObjectsUrl,
	buildObjectUrl,
	encodeObjectKey,
	joinPublicUrl
} from '../s3-urls.ts';

describe('encodeObjectKey', () => {
	it('keeps plain keys untouched', () => {
		expect(encodeObjectKey('images/cat.png')).toBe('images/cat.png');
	});

	it('encodes each segment independently', () => {
		expect(encodeObjectKey('我的 图/cat .png')).toBe('%E6%88%91%E7%9A%84%20%E5%9B%BE/cat%20.png');
	});

	it('RFC3986-encodes ! so SigV4 canonical paths match the wire URL', () => {
		expect(encodeObjectKey('a/Follow me!.jpg')).toBe('a/Follow%20me%21.jpg');
		expect(encodeObjectKey('a/Follow me!.jpg')).not.toContain('!');
	});

	it('rejects dot segments that URL normalization would swallow', () => {
		expect(() => encodeObjectKey('a/./b.png')).toThrow('Invalid object key: a/./b.png');
		expect(() => encodeObjectKey('a/../b.png')).toThrow('Invalid object key: a/../b.png');
	});
});

describe('buildObjectUrl', () => {
	it('builds path-style URLs', () => {
		expect(buildObjectUrl(
			{ bucket: 'pics', endpoint: 'https://minio.example.com', forcePathStyle: true },
			'images/cat.png'
		)).toBe('https://minio.example.com/pics/images/cat.png');
	});

	it('builds virtual-hosted-style URLs', () => {
		expect(buildObjectUrl(
			{ bucket: 'pics-1250000000', endpoint: 'https://cos.ap-guangzhou.myqcloud.com', forcePathStyle: false },
			'images/cat.png'
		)).toBe('https://pics-1250000000.cos.ap-guangzhou.myqcloud.com/images/cat.png');
	});

	it('tolerates a trailing slash on the endpoint', () => {
		expect(buildObjectUrl(
			{ bucket: 'pics', endpoint: 'https://minio.example.com/', forcePathStyle: true },
			'cat.png'
		)).toBe('https://minio.example.com/pics/cat.png');
	});
});

describe('buildListObjectsUrl', () => {
	it('encodes pagination options as query parameters', () => {
		expect(buildListObjectsUrl(
			{ bucket: 'pics', endpoint: 'https://minio.example.com', forcePathStyle: true },
			{ cursor: 'images/cat.png', limit: 24 }
		)).toBe(
			`https://minio.example.com/pics?list-type=2&max-keys=24&continuation-token=${encodeURIComponent('images/cat.png')}`
		);
	});

	it('encodes prefix for exists-style probes', () => {
		expect(buildListObjectsUrl(
			{ bucket: 'pics', endpoint: 'https://minio.example.com', forcePathStyle: true },
			{ limit: 2, prefix: 'images/cat.png' }
		)).toBe(
			`https://minio.example.com/pics?list-type=2&max-keys=2&prefix=${encodeURIComponent('images/cat.png')}`
		);
	});

	it('omits absent options', () => {
		expect(buildListObjectsUrl(
			{ bucket: 'pics', endpoint: 'https://minio.example.com', forcePathStyle: true },
			{}
		)).toBe('https://minio.example.com/pics?list-type=2');
	});
});

describe('joinPublicUrl', () => {
	it('joins base and key with a single slash', () => {
		expect(joinPublicUrl('https://cdn.example.com/', 'images/cat.png'))
			.toBe('https://cdn.example.com/images/cat.png');
	});

	it('double-encodes dot segments so CDNs do not normalize them away', () => {
		expect(joinPublicUrl('https://cdn.example.com', 'a/./b.png'))
			.toBe('https://cdn.example.com/a/%252E/b.png');
		expect(joinPublicUrl('https://cdn.example.com', 'a/../b.png'))
			.toBe('https://cdn.example.com/a/%252E%252E/b.png');
	});

	it('RFC3986-encodes ! in public URLs to match object keys', () => {
		expect(joinPublicUrl('https://cdn.example.com', 'images/Follow me!.jpg'))
			.toBe('https://cdn.example.com/images/Follow%20me%21.jpg');
	});
});
