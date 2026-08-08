import {
	describe,
	expect,
	it,
	vi
} from 'vitest';

import type { ImageRef } from '../../link/image-ref.ts';

import { ImageFileActions } from '../image-file-actions.ts';

const localRef: ImageRef = {
	decorations: [],
	end: 14,
	isRemote: false,
	kind: 'wiki',
	markdownTitle: null,
	source: '![[image.png]]',
	start: 0,
	target: 'image.png'
};

const remoteRef: ImageRef = {
	decorations: [],
	end: 44,
	isRemote: true,
	kind: 'markdown',
	markdownTitle: null,
	source: '![](https://cdn.example.com/image%20one.png)',
	start: 0,
	target: 'https://cdn.example.com/image%20one.png'
};

describe('ImageFileActions', () => {
	it('copies local image pixels after reading vault bytes', async () => {
		const imageCopy = vi.fn();
		const readBinary = vi.fn().mockResolvedValue(new Uint8Array([9, 8, 7]));
		const actions = createActions({
			imageClipboard: { copy: imageCopy },
			readBinary
		});

		await actions.copyImage(localRef, 'notes/note.md');

		expect(readBinary).toHaveBeenCalledWith('assets/image.png');
		expect(imageCopy).toHaveBeenCalledWith(new Uint8Array([9, 8, 7]));
	});

	it('downloads a remote image into memory before copying its pixels', async () => {
		const copy = vi.fn();
		const actions = createActions({ imageClipboard: { copy } });

		await actions.copyImage(remoteRef, 'notes/note.md');

		expect(copy).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]));
	});

	it('opens and reveals only resolved local files', async () => {
		const openDefault = vi.fn().mockResolvedValue(undefined);
		const showInFileList = vi.fn().mockResolvedValue(undefined);
		const showInFolder = vi.fn().mockResolvedValue(undefined);
		const actions = createActions({ openDefault, showInFileList, showInFolder });

		await actions.open(localRef, 'notes/note.md');
		await actions.showInFolder(localRef, 'notes/note.md');
		await actions.showInFileList(localRef, 'notes/note.md');

		expect(openDefault).toHaveBeenCalledWith('assets/image.png');
		expect(showInFolder).toHaveBeenCalledWith('assets/image.png');
		expect(showInFileList).toHaveBeenCalledWith('assets/image.png');
		await expect(actions.open(remoteRef, 'notes/note.md')).rejects.toThrow(
			'This action requires a local vault file.'
		);
	});

	it('opens local files in new tab, tab group, and window', async () => {
		const openInNewTab = vi.fn().mockResolvedValue(undefined);
		const openInNewTabGroup = vi.fn().mockResolvedValue(undefined);
		const openInNewWindow = vi.fn().mockResolvedValue(undefined);
		const actions = createActions({ openInNewTab, openInNewTabGroup, openInNewWindow });

		await actions.openInNewTab(localRef, 'notes/note.md');
		await actions.openInNewTabGroup(localRef, 'notes/note.md');
		await actions.openInNewWindow(localRef, 'notes/note.md');

		expect(openInNewTab).toHaveBeenCalledWith('assets/image.png');
		expect(openInNewTabGroup).toHaveBeenCalledWith('assets/image.png');
		expect(openInNewWindow).toHaveBeenCalledWith('assets/image.png');
	});

	it('copies vault, absolute, and Obsidian URL paths', async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		const actions = createActions({ writeText });

		await actions.copyVaultPath(localRef, 'notes/note.md');
		await actions.copyAbsolutePath(localRef, 'notes/note.md');
		await actions.copyObsidianUrl(localRef, 'notes/note.md');

		expect(writeText).toHaveBeenNthCalledWith(1, 'assets/image.png');
		expect(writeText).toHaveBeenNthCalledWith(2, '/vault/assets/image.png');
		expect(writeText).toHaveBeenNthCalledWith(
			3,
			`obsidian://open?vault=Demo&file=${encodeURIComponent('assets/image.png')}`
		);
	});

	it('replaces local image bytes from a picked file', async () => {
		const modifyBinary = vi.fn().mockResolvedValue(undefined);
		const pickReplacementBytes = vi.fn().mockResolvedValue(new Uint8Array([4, 5]));
		const actions = createActions({ modifyBinary, pickReplacementBytes });

		const replaced = await actions.replaceContent(localRef, 'notes/note.md');

		expect(replaced).toBe(true);
		expect(modifyBinary).toHaveBeenCalledWith('assets/image.png', new Uint8Array([4, 5]));
	});

	it('returns false when replacement picking is cancelled', async () => {
		const modifyBinary = vi.fn();
		const actions = createActions({
			modifyBinary,
			pickReplacementBytes: vi.fn().mockResolvedValue(null)
		});

		expect(await actions.replaceContent(localRef, 'notes/note.md')).toBe(false);
		expect(modifyBinary).not.toHaveBeenCalled();
	});

	it('renames, moves, stars, and deletes local files', async () => {
		const rename = vi.fn().mockResolvedValue(undefined);
		const move = vi.fn().mockResolvedValue(undefined);
		const star = vi.fn().mockResolvedValue(undefined);
		const trash = vi.fn().mockResolvedValue(undefined);
		const promptDelete = vi.fn().mockResolvedValue(true);
		const actions = createActions({ move, promptDelete, rename, star, trash });

		await actions.rename(localRef, 'notes/note.md');
		await actions.move(localRef, 'notes/note.md');
		await actions.star(localRef, 'notes/note.md');
		expect(await actions.deleteFile(localRef, 'notes/note.md')).toBe(true);

		expect(rename).toHaveBeenCalledWith('assets/image.png');
		expect(move).toHaveBeenCalledWith('assets/image.png');
		expect(star).toHaveBeenCalledWith('assets/image.png');
		expect(promptDelete).toHaveBeenCalledWith('assets/image.png');
		expect(trash).toHaveBeenCalledWith('assets/image.png');
	});
});

function createActions(overrides: Record<string, unknown> = {}): ImageFileActions {
	return new ImageFileActions({
		getObsidianUrl: vi.fn().mockReturnValue(
			`obsidian://open?vault=Demo&file=${encodeURIComponent('assets/image.png')}`
		),
		http: { fetchBinary: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])) },
		imageClipboard: { copy: vi.fn() },
		modifyBinary: vi.fn().mockResolvedValue(undefined),
		move: vi.fn().mockResolvedValue(undefined),
		openDefault: vi.fn().mockResolvedValue(undefined),
		openInNewTab: vi.fn().mockResolvedValue(undefined),
		openInNewTabGroup: vi.fn().mockResolvedValue(undefined),
		openInNewWindow: vi.fn().mockResolvedValue(undefined),
		pickReplacementBytes: vi.fn().mockResolvedValue(null),
		promptDelete: vi.fn().mockResolvedValue(true),
		readBinary: vi.fn().mockResolvedValue(new Uint8Array([9, 8, 7])),
		rename: vi.fn().mockResolvedValue(undefined),
		resolveVaultPath: vi.fn().mockReturnValue('assets/image.png'),
		showInFileList: vi.fn().mockResolvedValue(undefined),
		showInFolder: vi.fn().mockResolvedValue(undefined),
		star: vi.fn().mockResolvedValue(undefined),
		toSystemPath: vi.fn().mockReturnValue('/vault/assets/image.png'),
		trash: vi.fn().mockResolvedValue(undefined),
		writeText: vi.fn().mockResolvedValue(undefined),
		...overrides
	});
}
