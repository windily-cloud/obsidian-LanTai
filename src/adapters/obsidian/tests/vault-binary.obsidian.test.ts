import type { App } from 'obsidian';
import type { Mock } from 'vitest';

import { fromPartial } from '@total-typescript/shoehorn';
import {
	describe,
	expect,
	it,
	vi
} from 'vitest';

import { ObsidianVaultBinary } from '../vault-binary.obsidian.ts';

interface CreateVaultOptions {
	readonly files?: readonly string[];
	readonly getFirstLinkpathDest?: Mock;
}

describe('ObsidianVaultBinary.resolvePath', () => {
	it('resolves a path-bearing target to the file the link points at, not a same-named one', () => {
		// 库内两个同名文件：链接写明完整路径时必须命中路径所指的那个，而不是按 basename 猜测。
		const getFirstLinkpathDest = vi.fn().mockReturnValue({
			path: 'repository/images/卡片B/cover.webp'
		});
		const vault = createVault({
			files: [
				'repository/images/卡片A/cover.webp',
				'repository/images/卡片B/cover.webp'
			],
			getFirstLinkpathDest
		});

		expect(
			vault.resolvePath('../../repository/images/卡片A/cover.webp', '卡片/卡片A/卡片A.md')
		).toBe('repository/images/卡片A/cover.webp');
		expect(getFirstLinkpathDest).not.toHaveBeenCalled();
	});

	it('does not fall back to a same-named file elsewhere when the exact path is missing', () => {
		const getFirstLinkpathDest = vi.fn().mockReturnValue({
			path: 'repository/images/卡片B/cover.webp'
		});
		const vault = createVault({
			files: ['repository/images/卡片B/cover.webp'],
			getFirstLinkpathDest
		});

		expect(
			vault.resolvePath('repository/images/卡片A/cover.webp', '卡片/卡片A.md')
		).toBeNull();
		expect(getFirstLinkpathDest).not.toHaveBeenCalled();
	});

	it('prefers the note-relative path over the vault-root path', () => {
		const vault = createVault({
			files: ['Notes/images/photo.png', 'images/photo.png']
		});

		expect(vault.resolvePath('images/photo.png', 'Notes/note.md')).toBe(
			'Notes/images/photo.png'
		);
		expect(vault.resolvePath('/images/photo.png', 'Notes/note.md')).toBe('images/photo.png');
	});

	it('decodes a percent-encoded path before matching the vault file', () => {
		const vault = createVault({
			files: ['_assets/attachments/Pasted image.png']
		});

		expect(
			vault.resolvePath('_assets/attachments/Pasted%20image.png', '未命名.md')
		).toBe('_assets/attachments/Pasted image.png');
	});

	it('clamps relative paths that escape the vault root', () => {
		const vault = createVault({ files: ['a.png'] });

		expect(vault.resolvePath('../../../a.png', 'x/y/z.md')).toBe('a.png');
	});

	it('matches the exact path ignoring case as a last resort', () => {
		const vault = createVault({ files: ['Repository/Images/Cover.webp'] });

		expect(vault.resolvePath('repository/images/cover.webp', 'A.md')).toBe(
			'Repository/Images/Cover.webp'
		);
	});

	it('keeps a literal %7C in the filename instead of decoding it to a pipe', () => {
		const encodedName = '其中包括图片：hero %7C cute-anime.png';
		const getFirstLinkpathDest = vi.fn((linkpath: string) => {
			if (linkpath === encodedName) {
				return { path: `测试/兰台测试/images/${encodedName}` };
			}
			return null;
		});
		const vault = createVault({ getFirstLinkpathDest });

		expect(vault.resolvePath(encodedName, '测试/兰台测试/测试笔记.md')).toBe(
			`测试/兰台测试/images/${encodedName}`
		);
		expect(getFirstLinkpathDest).toHaveBeenCalledWith(encodedName, '测试/兰台测试/测试笔记.md');
	});

	it('resolves wiki-style bare filenames through Obsidian linkpath API', () => {
		const getFirstLinkpathDest = vi.fn().mockReturnValue({
			path: '_assets/attachments/photo.jpeg'
		});
		const vault = createVault({ getFirstLinkpathDest });

		expect(vault.resolvePath('photo.jpeg', '未命名.md')).toBe(
			'_assets/attachments/photo.jpeg'
		);
		expect(getFirstLinkpathDest).toHaveBeenCalledWith('photo.jpeg', '未命名.md');
	});

	it('strips app:// resource URLs and resolves the resource path exactly', () => {
		const vault = createVault({ files: ['_assets/attachments/photo.png'] });

		expect(
			vault.resolvePath(
				'app://local/vault-id/_assets/attachments/photo.png',
				'未命名.md'
			)
		).toBe('_assets/attachments/photo.png');
	});
});

function createVault(options: CreateVaultOptions): ObsidianVaultBinary {
	const files = options.files ?? [];
	return new ObsidianVaultBinary({
		app: fromPartial<App>({
			metadataCache: {
				getFirstLinkpathDest: options.getFirstLinkpathDest ?? vi.fn().mockReturnValue(null)
			},
			vault: {
				getFileByPath: vi.fn((path: string) => files.includes(path) ? { path } : null),
				getFiles: vi.fn(() => files.map((path) => ({ path })))
			}
		})
	});
}
