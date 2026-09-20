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
	readonly getFirstLinkpathDest?: Mock;
}

describe('ObsidianVaultBinary.resolvePath', () => {
	it('resolves by filename through Obsidian linkpath API', () => {
		const getFirstLinkpathDest = vi.fn((linkpath: string) => {
			if (linkpath === 'Pasted image.png') {
				return { path: '_assets/attachments/Pasted image.png' };
			}
			return null;
		});
		const vault = createVault({ getFirstLinkpathDest });

		expect(
			vault.resolvePath(
				'_assets/attachments/Pasted%20image.png',
				'未命名.md'
			)
		).toBe('_assets/attachments/Pasted image.png');
		expect(getFirstLinkpathDest).toHaveBeenCalledWith('Pasted image.png', '未命名.md');
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

	it('strips app:// resource URLs before resolving by filename', () => {
		const getFirstLinkpathDest = vi.fn((linkpath: string) => {
			if (linkpath === 'photo.png') {
				return { path: '_assets/attachments/photo.png' };
			}
			return null;
		});
		const vault = createVault({ getFirstLinkpathDest });

		expect(
			vault.resolvePath(
				'app://local/vault-id/_assets/attachments/photo.png',
				'未命名.md'
			)
		).toBe('_assets/attachments/photo.png');
		expect(getFirstLinkpathDest).toHaveBeenCalledWith('photo.png', '未命名.md');
	});
});

function createVault(options: CreateVaultOptions): ObsidianVaultBinary {
	return new ObsidianVaultBinary({
		app: fromPartial<App>({
			metadataCache: {
				getFirstLinkpathDest: options.getFirstLinkpathDest ?? vi.fn().mockReturnValue(null)
			},
			vault: {
				getFileByPath: vi.fn().mockReturnValue(null)
			}
		})
	});
}
