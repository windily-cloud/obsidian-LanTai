import {
	describe,
	expect,
	it
} from 'vitest';

import {
	bustRenderedImageSrc,
	imageSrcPath,
	refreshRenderedImageSources,
	srcMatchesVaultPath
} from '../bust-rendered-image-src.ts';

describe('imageSrcPath', () => {
	it('strips query and hash', () => {
		expect(imageSrcPath('app://local/vault/assets/photo.png?mtime=1'))
			.toBe('app://local/vault/assets/photo.png');
		expect(imageSrcPath('app://local/vault/assets/photo.png#frag'))
			.toBe('app://local/vault/assets/photo.png');
	});
});

describe('bustRenderedImageSrc', () => {
	it('always stamps a fresh mtime even when resourceUrl already has one', () => {
		expect(bustRenderedImageSrc(
			'app://local/vault/assets/photo.png?mtime=1',
			'app://local/vault/assets/photo.png?mtime=1',
			99
		)).toBe('app://local/vault/assets/photo.png?mtime=99');
	});

	it('adds an mtime query when the resource URL has none', () => {
		const next = bustRenderedImageSrc(
			'app://local/vault/assets/photo.png?mtime=1',
			'app://local/vault/assets/photo.png',
			1710000000000
		);
		expect(next).toBe('app://local/vault/assets/photo.png?mtime=1710000000000');
	});

	it('works when the current src has no query', () => {
		expect(bustRenderedImageSrc(
			'app://local/vault/assets/photo.png',
			'app://local/vault/assets/photo.png?mtime=42',
			42
		)).toBe('app://local/vault/assets/photo.png?mtime=42');
	});
});

describe('srcMatchesVaultPath', () => {
	it('matches app:// src against a vault-relative path', () => {
		expect(srcMatchesVaultPath(
			'app://local/vault-id/assets/photo.png?mtime=1',
			'assets/photo.png'
		)).toBe(true);
	});

	it('does not match a different file', () => {
		expect(srcMatchesVaultPath(
			'app://local/vault/assets/photo.png?mtime=1',
			'assets/other.png'
		)).toBe(false);
	});
});

describe('refreshRenderedImageSources', () => {
	it('updates matching imgs and leaves others alone', () => {
		const root = createDiv();
		const match = root.createEl('img', {
			attr: { src: 'app://local/vault/assets/photo.png?mtime=1' }
		});
		const other = root.createEl('img', {
			attr: { src: 'app://local/vault/assets/other.png?mtime=1' }
		});

		const updated = refreshRenderedImageSources(root, {
			mtime: 99,
			resourceUrl: 'app://local/vault/assets/photo.png?mtime=1',
			vaultPath: 'assets/photo.png'
		});

		expect(updated).toBe(1);
		expect(match.getAttribute('src')).toBe('app://local/vault/assets/photo.png?mtime=99');
		expect(match.src).toContain('mtime=99');
		expect(other.getAttribute('src')).toBe('app://local/vault/assets/other.png?mtime=1');
	});

	it('matches data-path when src is a opaque local URL', () => {
		const root = createDiv();
		const match = root.createEl('img', {
			attr: {
				'data-path': 'assets/photo.png',
				'src': 'http://localhost/_capacitor_file_/opaque'
			}
		});

		const updated = refreshRenderedImageSources(root, {
			mtime: 7,
			resourceUrl: 'app://local/vault/assets/photo.png?mtime=1',
			vaultPath: 'assets/photo.png'
		});

		expect(updated).toBe(1);
		expect(match.getAttribute('src')).toBe('app://local/vault/assets/photo.png?mtime=7');
	});
});
