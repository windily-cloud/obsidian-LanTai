import type {
	App,
	TFile
} from 'obsidian';
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
	it('resolves a percent-encoded vault path exactly instead of by filename', () => {
		const getFirstLinkpathDest = vi.fn().mockReturnValue({ path: 'wrong-by-name.png' });
		const vault = createVault({
			files: ['_assets/attachments/Pasted image.png'],
			getFirstLinkpathDest
		});

		expect(
			vault.resolvePath(
				'_assets/attachments/Pasted%20image.png',
				'未命名.md'
			)
		).toBe('_assets/attachments/Pasted image.png');
		expect(getFirstLinkpathDest).not.toHaveBeenCalled();
	});

	it('prefers the note-relative file over a vault-root file', () => {
		const vault = createVault({
			files: ['Journal/assets/photo.png', 'assets/photo.png']
		});

		expect(vault.resolvePath('assets/photo.png', 'Journal/note.md')).toBe(
			'Journal/assets/photo.png'
		);
	});

	it('falls back to the vault root when the note-relative path is missing', () => {
		const vault = createVault({ files: ['assets/photo.png'] });

		expect(vault.resolvePath('assets/photo.png', 'Journal/note.md')).toBe('assets/photo.png');
	});

	it('returns null for a missing path even when a same-named file exists elsewhere', () => {
		const getFirstLinkpathDest = vi.fn().mockReturnValue({
			path: 'repository/images/卡片B/cover.webp'
		});
		const vault = createVault({
			files: ['repository/images/卡片B/cover.webp'],
			getFirstLinkpathDest
		});

		expect(
			vault.resolvePath(
				'../../repository/images/卡片A/cover.webp',
				'卡片A/卡片A.md'
			)
		).toBeNull();
		expect(getFirstLinkpathDest).not.toHaveBeenCalled();
	});

	it('clamps parent segments that escape the vault root', () => {
		const vault = createVault({ files: ['repository/images/a.png'] });

		expect(
			vault.resolvePath(
				'../../../repository/images/a.png',
				'卡片A/卡片A.md'
			)
		).toBe('repository/images/a.png');
	});

	it('tolerates case differences in a full path', () => {
		const vault = createVault({ files: ['Assets/Photo.PNG'] });

		expect(vault.resolvePath('assets/photo.png', 'note.md')).toBe('Assets/Photo.PNG');
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

	it('strips app:// resource URLs before resolving the vault path exactly', () => {
		const getFirstLinkpathDest = vi.fn().mockReturnValue({ path: 'wrong.png' });
		const vault = createVault({
			files: ['_assets/attachments/photo.png'],
			getFirstLinkpathDest
		});

		expect(
			vault.resolvePath(
				'app://local/vault-id/_assets/attachments/photo.png',
				'未命名.md'
			)
		).toBe('_assets/attachments/photo.png');
		expect(getFirstLinkpathDest).not.toHaveBeenCalled();
	});
});

function createVault(options: CreateVaultOptions = {}): ObsidianVaultBinary {
	const files = (options.files ?? []).map((path) => fromPartial<TFile>({ path }));
	return new ObsidianVaultBinary({
		app: fromPartial<App>({
			metadataCache: {
				getFirstLinkpathDest: options.getFirstLinkpathDest ?? vi.fn().mockReturnValue(null)
			},
			vault: {
				getFileByPath: vi.fn((path: string) => files.find((file) => file.path === path) ?? null),
				getFiles: vi.fn(() => files)
			}
		})
	});
}
