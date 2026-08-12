import {
	describe,
	expect,
	it
} from 'vitest';

import { ImageLinkParser } from '../link/image-link-parser.ts';
import {
	findRenderedImageRef,
	identityMatchesRef,
	menuCapabilities,
	readRenderedImageIdentity,
	selectPreciseImageOffset,
	toImageTarget,
	visibleImageMenuGroups
} from './resolve-rendered-image.ts';

describe('readRenderedImageIdentity', () => {
	it('prefers data-path as a local identity', () => {
		const image = createDiv().createEl('img', {
			attr: {
				'data-path': 'assets/photo.png',
				'src': 'https://cdn.example.com/photo.png'
			}
		});

		expect(readRenderedImageIdentity(image)).toEqual({
			kind: 'local',
			target: 'assets/photo.png'
		});
	});

	it('treats http(s) src as remote and ignores decorative alt', () => {
		const image = createDiv().createEl('img', {
			attr: {
				alt: '700',
				src: 'https://cdn.example.com/photo.png'
			}
		});

		expect(readRenderedImageIdentity(image)).toEqual({
			kind: 'remote',
			target: 'https://cdn.example.com/photo.png'
		});
	});

	it('treats app:// and relative src as local', () => {
		const appImage = createDiv().createEl('img', {
			attr: { src: 'app://local/vault/assets/photo.png' }
		});
		const relativeImage = createDiv().createEl('img', {
			attr: { src: 'photo.png' }
		});

		expect(readRenderedImageIdentity(appImage)).toEqual({
			kind: 'local',
			target: 'app://local/vault/assets/photo.png'
		});
		expect(readRenderedImageIdentity(relativeImage)).toEqual({
			kind: 'local',
			target: 'photo.png'
		});
	});

	it('matches wiki targets against app:// identities that include query strings', () => {
		expect(
			identityMatchesRef(
				{
					kind: 'local',
					target: 'app://local/vault-id/_assets/attachments/photo.png?mtime=1'
				},
				{
					decorations: [],
					end: 14,
					isRemote: false,
					kind: 'wiki',
					markdownTitle: null,
					source: '![[photo.png]]',
					start: 0,
					target: 'photo.png'
				}
			)
		).toBe(true);
	});

	it('keeps loopback http src remote by default (desktop)', () => {
		const image = createDiv().createEl('img', {
			attr: { src: 'http://127.0.0.1:27123/vault/photo.png' }
		});

		expect(readRenderedImageIdentity(image)).toEqual({
			kind: 'remote',
			target: 'http://127.0.0.1:27123/vault/photo.png'
		});
	});

	it('treats loopback, capacitor, file, and blob src as local when asked', () => {
		expect(
			readRenderedImageIdentity(
				createDiv().createEl('img', {
					attr: { src: 'http://127.0.0.1:27123/vault/photo.png' }
				}),
				true
			)
		).toEqual({
			kind: 'local',
			target: 'http://127.0.0.1:27123/vault/photo.png'
		});
		expect(
			readRenderedImageIdentity(
				createDiv().createEl('img', {
					attr: { src: 'http://localhost:1234/photo.png' }
				}),
				true
			)?.kind
		).toBe('local');
		expect(
			readRenderedImageIdentity(
				createDiv().createEl('img', {
					attr: { src: 'capacitor://localhost/_capacitor_file_/photo.png' }
				}),
				true
			)?.kind
		).toBe('local');
		expect(
			readRenderedImageIdentity(
				createDiv().createEl('img', {
					attr: { src: 'file:///vault/photo.png' }
				}),
				true
			)?.kind
		).toBe('local');
		expect(
			readRenderedImageIdentity(
				createDiv().createEl('img', {
					attr: { src: 'blob:http://localhost/abc' }
				}),
				true
			)?.kind
		).toBe('local');
		expect(
			readRenderedImageIdentity(
				createDiv().createEl('img', {
					attr: { src: 'https://cdn.example.com/photo.png' }
				}),
				true
			)?.kind
		).toBe('remote');
	});
});

describe('findRenderedImageRef', () => {
	const parser = new ImageLinkParser();

	it('does not cross-match local wiki links with remote urls of the same filename', () => {
		const root = createDiv();
		const localImage = root.createEl('img', {
			attr: { 'data-path': 'photo.png', 'src': 'app://local/vault/photo.png' }
		});
		const remoteImage = root.createEl('img', {
			attr: {
				alt: '700',
				src: 'https://cdn.example.com/photo.png'
			}
		});
		const refs = parser.parse(
			'![[photo.png]]\n![700](https://cdn.example.com/photo.png)'
		);

		expect(findRenderedImageRef(refs, localImage, root)?.kind).toBe('wiki');
		expect(findRenderedImageRef(refs, localImage, root)?.isRemote).toBe(false);
		expect(findRenderedImageRef(refs, remoteImage, root)?.isRemote).toBe(true);
		expect(findRenderedImageRef(refs, remoteImage, root)?.target).toBe(
			'https://cdn.example.com/photo.png'
		);
	});

	it('maps duplicate local images even when a same-named remote image is present', () => {
		const root = createDiv();
		const first = root.createEl('img', {
			attr: { 'data-path': 'photo.png', 'src': 'app://local/vault/photo.png' }
		});
		const second = root.createEl('img', {
			attr: { 'data-path': 'photo.png', 'src': 'app://local/vault/photo.png' }
		});
		root.createEl('img', {
			attr: { src: 'https://cdn.example.com/photo.png' }
		});
		const source = '![[photo.png]] then ![[photo.png]] and ![](https://cdn.example.com/photo.png)';
		const refs = parser.parse(source);

		expect(findRenderedImageRef(refs, first, root)?.start).toBe(0);
		expect(findRenderedImageRef(refs, second, root)?.start).toBe(
			source.indexOf('![[photo.png]]', 1)
		);
	});

	it('matches repeated rendered images to their corresponding source occurrence', () => {
		const root = createDiv();
		const firstImage = root.createEl('img', { attr: { src: 'same.png' } });
		const secondImage = root.createEl('img', { attr: { src: 'same.png' } });
		const refs = parser.parse('![[same.png]] then ![[same.png]]');

		expect(findRenderedImageRef(refs, firstImage, root)?.start).toBe(0);
		expect(findRenderedImageRef(refs, secondImage, root)?.start).toBe(19);
	});

	it('does not guess when the rendered occurrence has no source counterpart', () => {
		const root = createDiv();
		root.createEl('img', { attr: { src: 'same.png' } });
		root.createEl('img', { attr: { src: 'same.png' } });
		const extraImage = root.createEl('img', { attr: { src: 'same.png' } });
		const refs = parser.parse('![[same.png]] then ![[same.png]]');

		expect(findRenderedImageRef(refs, extraImage, root)).toBeNull();
	});

	it('uses the rendered source range when an earlier matching link is not rendered', () => {
		const root = createDiv();
		const image = root.createEl('img', { attr: { src: 'same.png' } });
		const source = '`![[same.png]]` then ![[same.png]]';
		const refs = parser.parse(source);
		const visibleStart = source.lastIndexOf('![[same.png]]');

		expect(
			findRenderedImageRef(refs, image, root, {
				end: source.length,
				start: visibleStart
			})?.start
		).toBe(visibleStart);
	});

	it('matches duplicates only within the rendered section range', () => {
		const root = createDiv();
		const first = root.createEl('img', { attr: { src: 'same.png' } });
		const second = root.createEl('img', { attr: { src: 'same.png' } });
		const source = '![[same.png]]\nsection ![[same.png]] and ![[same.png]]';
		const refs = parser.parse(source);
		const sectionStart = source.indexOf('section');

		expect(
			findRenderedImageRef(refs, first, root, {
				end: source.length,
				start: sectionStart
			})?.start
		).toBe(source.indexOf('![[same.png]]', sectionStart));
		expect(
			findRenderedImageRef(refs, second, root, {
				end: source.length,
				start: sectionStart
			})?.start
		).toBe(source.lastIndexOf('![[same.png]]'));
	});

	it('ignores decorative alt when matching remote images to local refs', () => {
		const root = createDiv();
		const image = root.createEl('img', {
			attr: {
				alt: 'photo.png',
				src: 'https://cdn.example.com/other.png'
			}
		});
		const refs = parser.parse('![[photo.png]]\n![](https://cdn.example.com/other.png)');

		expect(findRenderedImageRef(refs, image, root)?.target).toBe(
			'https://cdn.example.com/other.png'
		);
	});

	it('matches a mobile loopback src to a local wiki link', () => {
		const root = createDiv();
		const image = root.createEl('img', {
			attr: { src: 'http://127.0.0.1:27123/vault/photo.png' }
		});
		const refs = parser.parse('![[photo.png]]');

		expect(
			findRenderedImageRef(refs, image, root, undefined, true)?.target
		).toBe('photo.png');
		expect(findRenderedImageRef(refs, image, root)).toBeNull();
	});

	it('resolves duplicates when the search root is only one source-view fragment', () => {
		const sourceView = createDiv({ cls: 'markdown-source-view' });
		const block1 = sourceView.createDiv();
		const block2 = sourceView.createDiv();
		const first = block1.createEl('img', { attr: { src: 'same.png' } });
		const second = block2.createEl('img', { attr: { src: 'same.png' } });
		const source = '![[same.png]]\n\n![[same.png]]';
		const refs = parser.parse(source);

		expect(findRenderedImageRef(refs, first, block1)?.start).toBe(0);
		expect(findRenderedImageRef(refs, second, block2)?.start).toBe(
			source.lastIndexOf('![[same.png]]')
		);
	});

	it('falls back to occurrence matching when a non-precise range misses all refs', () => {
		const sourceView = createDiv({ cls: 'markdown-source-view' });
		const block = sourceView.createDiv();
		const image = block.createEl('img', { attr: { src: 'same.png' } });
		sourceView.createDiv().createEl('img', { attr: { src: 'same.png' } });
		const source = '![[same.png]] then ![[same.png]]';
		const refs = parser.parse(source);

		expect(
			findRenderedImageRef(refs, image, block, {
				end: 0,
				start: 0
			})?.start
		).toBe(0);
	});

	it('resolves Live Preview duplicates when the leaf also keeps a hidden reading preview', () => {
		const leaf = createDiv({ cls: 'workspace-leaf-content' });
		const sourceView = leaf.createDiv({ cls: 'markdown-source-view' });
		const readingView = leaf.createDiv({ cls: 'markdown-reading-view' });
		const preview = readingView.createDiv({ cls: 'markdown-preview-view' });
		const first = sourceView.createEl('img', {
			attr: { src: 'app://local/vault/assets/same.png?mtime=1' }
		});
		const second = sourceView.createEl('img', {
			attr: { src: 'app://local/vault/assets/same.png?mtime=1' }
		});
		preview.createEl('img', { attr: { src: 'app://local/vault/assets/same.png?mtime=1' } });
		preview.createEl('img', { attr: { src: 'app://local/vault/assets/same.png?mtime=1' } });
		const source = '![[same.png]]\n\n![[same.png]]';
		const refs = parser.parse(source);

		expect(findRenderedImageRef(refs, first, leaf)?.start).toBe(0);
		expect(findRenderedImageRef(refs, second, leaf)?.start).toBe(
			source.lastIndexOf('![[same.png]]')
		);
	});

	it('matches local wiki links against app:// src with a cache-busting query', () => {
		const root = createDiv({ cls: 'markdown-source-view' });
		const image = root.createEl('img', {
			attr: { src: 'app://local/vault-id/_assets/attachments/photo.png?mtime=1710000000000' }
		});
		const refs = parser.parse('![[photo.png]]');

		expect(findRenderedImageRef(refs, image, root)?.target).toBe('photo.png');
	});
});

describe('menuCapabilities', () => {
	it('keeps download and copy available when only identity is known', () => {
		expect(
			menuCapabilities({
				identity: { kind: 'remote', target: 'https://cdn.example.com/a.png' },
				ref: null
			})
		).toEqual({
			copy: true,
			copyAbsolutePath: false,
			copyPath: false,
			deleteFile: false,
			download: true,
			layout: true,
			localize: false,
			move: false,
			openLink: false,
			openLocal: false,
			openTab: false,
			openWindow: false,
			remove: false,
			rename: false,
			replace: false,
			resetSize: false,
			share: false,
			star: false,
			upload: false
		});
	});

	it('enables local vault actions when a unique local ref is present', () => {
		expect(
			menuCapabilities({
				identity: { kind: 'local', target: 'photo.png' },
				ref: {
					decorations: ['300'],
					end: 18,
					isRemote: false,
					kind: 'wiki',
					markdownTitle: null,
					source: '![[photo.png|300]]',
					start: 0,
					target: 'photo.png'
				}
			})
		).toEqual({
			copy: true,
			copyAbsolutePath: true,
			copyPath: true,
			deleteFile: true,
			download: true,
			layout: true,
			localize: false,
			move: true,
			openLink: false,
			openLocal: true,
			openTab: true,
			openWindow: true,
			remove: true,
			rename: true,
			replace: true,
			resetSize: true,
			share: false,
			star: true,
			upload: true
		});
	});

	it('hides desktop-only actions on mobile while restoring native image actions', () => {
		expect(
			menuCapabilities({
				identity: { kind: 'local', target: 'photo.png' },
				platform: { canShare: true, isMobile: true },
				ref: {
					decorations: [],
					end: 14,
					isRemote: false,
					kind: 'wiki',
					markdownTitle: null,
					source: '![[photo.png]]',
					start: 0,
					target: 'photo.png'
				}
			})
		).toMatchObject({
			copy: true,
			copyAbsolutePath: false,
			copyPath: true,
			download: true,
			layout: true,
			openLink: true,
			openLocal: false,
			openTab: true,
			openWindow: false,
			replace: true,
			share: true,
			upload: true
		});
	});

	it('hides layout on mobile when the image has no resolved ref', () => {
		expect(
			menuCapabilities({
				identity: { kind: 'local', target: 'photo.png' },
				platform: { isMobile: true },
				ref: null
			}).layout
		).toBe(false);
	});

	it('hides share on mobile when the web share API is unavailable', () => {
		expect(
			menuCapabilities({
				identity: { kind: 'local', target: 'photo.png' },
				platform: { canShare: false, isMobile: true },
				ref: {
					decorations: [],
					end: 14,
					isRemote: false,
					kind: 'wiki',
					markdownTitle: null,
					source: '![[photo.png]]',
					start: 0,
					target: 'photo.png'
				}
			}).share
		).toBe(false);
	});

	it('disables reset size when the link has no size decoration', () => {
		expect(
			menuCapabilities({
				identity: { kind: 'local', target: 'photo.png' },
				ref: {
					decorations: [],
					end: 14,
					isRemote: false,
					kind: 'wiki',
					markdownTitle: null,
					source: '![[photo.png]]',
					start: 0,
					target: 'photo.png'
				}
			}).resetSize
		).toBe(false);
	});

	it('enables localize for a unique remote ref and keeps local-only actions off', () => {
		expect(
			menuCapabilities({
				identity: { kind: 'remote', target: 'https://cdn.example.com/a.png' },
				ref: {
					decorations: [],
					end: 40,
					isRemote: true,
					kind: 'markdown',
					markdownTitle: null,
					source: '![](https://cdn.example.com/a.png)',
					start: 0,
					target: 'https://cdn.example.com/a.png'
				}
			})
		).toMatchObject({
			copyPath: false,
			deleteFile: false,
			layout: true,
			localize: true,
			openLocal: false,
			remove: true,
			resetSize: false,
			upload: false
		});
	});
});

describe('visibleImageMenuGroups', () => {
	it('always includes layout for remote images and omits local-only groups', () => {
		const capabilities = menuCapabilities({
			identity: { kind: 'remote', target: 'https://cdn.example.com/a.png' },
			ref: {
				decorations: [],
				end: 40,
				isRemote: true,
				kind: 'markdown',
				markdownTitle: null,
				source: '![](https://cdn.example.com/a.png)',
				start: 0,
				target: 'https://cdn.example.com/a.png'
			}
		});

		expect(visibleImageMenuGroups(capabilities)).toEqual([
			['copy'],
			['localize', 'download'],
			['layout'],
			['remove']
		]);
	});

	it('keeps layout visible even when the remote image has no resolved ref', () => {
		const capabilities = menuCapabilities({
			identity: { kind: 'remote', target: 'https://cdn.example.com/a.png' },
			ref: null
		});

		expect(visibleImageMenuGroups(capabilities)).toEqual([
			['copy'],
			['download'],
			['layout']
		]);
	});

	it('omits resetSize when the local image has no size decoration but keeps layout', () => {
		const capabilities = menuCapabilities({
			identity: { kind: 'local', target: 'photo.png' },
			ref: {
				decorations: [],
				end: 14,
				isRemote: false,
				kind: 'wiki',
				markdownTitle: null,
				source: '![[photo.png]]',
				start: 0,
				target: 'photo.png'
			}
		});

		const groups = visibleImageMenuGroups(capabilities);

		expect(groups[0]).toEqual(['copy']);
		expect(groups[1]).toEqual(['upload', 'download']);
		expect(groups[2]).toEqual(['replace']);
		expect(groups.some((group) => group.includes('localize'))).toBe(false);
		expect(groups.find((group) => group.includes('layout'))).toEqual(['copyPath', 'layout']);
		expect(groups.at(-1)).toEqual(['remove', 'deleteFile']);
	});

	it('puts upload first on mobile and includes native-parity actions', () => {
		const capabilities = menuCapabilities({
			identity: { kind: 'local', target: 'photo.png' },
			platform: { canShare: true, isMobile: true },
			ref: {
				decorations: [],
				end: 14,
				isRemote: false,
				kind: 'wiki',
				markdownTitle: null,
				source: '![[photo.png]]',
				start: 0,
				target: 'photo.png'
			}
		});

		expect(visibleImageMenuGroups(capabilities, { isMobile: true })[0]).toEqual([
			'upload',
			'download'
		]);
		expect(visibleImageMenuGroups(capabilities, { isMobile: true })).toEqual([
			['upload', 'download'],
			['copy'],
			['replace'],
			['openLink', 'openInNewTab'],
			['rename', 'move', 'star'],
			['share'],
			['copyPath', 'layout'],
			['remove', 'deleteFile']
		]);
	});
});

describe('toImageTarget', () => {
	it('preserves vault-relative data-path targets', () => {
		expect(
			toImageTarget({ kind: 'local', target: 'assets/photo.png' }, null)
		).toEqual({
			isRemote: false,
			target: 'assets/photo.png'
		});
	});

	it('strips app:// vault prefixes for action targets', () => {
		expect(
			toImageTarget(
				{ kind: 'local', target: 'app://local/vault/assets/photo.png' },
				null
			)
		).toEqual({
			isRemote: false,
			target: 'assets/photo.png'
		});
	});

	it('decodes percent-encoded local markdown targets for vault actions', () => {
		expect(
			toImageTarget(
				{ kind: 'local', target: '_assets/attachments/Pasted image.png' },
				{
					decorations: [],
					end: 60,
					isRemote: false,
					kind: 'markdown',
					markdownTitle: null,
					source: '![](_assets/attachments/Pasted%20image.png)',
					start: 0,
					target: '_assets/attachments/Pasted%20image.png'
				}
			)
		).toEqual({
			isRemote: false,
			target: '_assets/attachments/Pasted image.png'
		});
	});
});

describe('selectPreciseImageOffset', () => {
	const refs = [
		{ end: 20, start: 0 },
		{ end: 50, start: 30 }
	];

	it('prefers the DOM position over a coordinate that misses every image link', () => {
		expect(
			selectPreciseImageOffset({
				coordinatePosition: 25,
				domPosition: 8,
				refs
			})
		).toBe(8);
	});

	it('uses the coordinate position when it falls inside an image link', () => {
		expect(
			selectPreciseImageOffset({
				coordinatePosition: 35,
				domPosition: 8,
				refs
			})
		).toBe(35);
	});

	it('falls back to the DOM position when coordinates are unavailable', () => {
		expect(
			selectPreciseImageOffset({
				coordinatePosition: null,
				domPosition: 12,
				refs
			})
		).toBe(12);
	});
});
