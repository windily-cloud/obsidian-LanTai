import {
	describe,
	expect,
	it
} from 'vitest';

import { isImageExtension } from '../image-extension.ts';
import { buildNameTemplateContext } from '../name-template-context.ts';
import { nextAvailablePath } from '../next-available-path.ts';

describe('isImageExtension', () => {
	it('accepts common image extensions case-insensitively', () => {
		expect(isImageExtension('png')).toBe(true);
		expect(isImageExtension('JPG')).toBe(true);
		expect(isImageExtension('jpeg')).toBe(true);
		expect(isImageExtension('webp')).toBe(true);
		expect(isImageExtension('svg')).toBe(true);
		expect(isImageExtension('avif')).toBe(true);
	});

	it('rejects non-image extensions', () => {
		expect(isImageExtension('pdf')).toBe(false);
		expect(isImageExtension('md')).toBe(false);
		expect(isImageExtension('')).toBe(false);
	});
});

describe('buildNameTemplateContext', () => {
	it('builds note and image tokens from note path and original name', () => {
		const ctx = buildNameTemplateContext({
			ext: 'png',
			noteFilePath: 'Journal/MyNote.md',
			now: new Date(2026, 6, 22, 12, 0, 0),
			originalName: 'photo'
		});
		expect(ctx).toEqual({
			ext: 'png',
			noteFileName: 'MyNote',
			noteFilePath: 'Journal/MyNote',
			noteFolderName: 'Journal',
			noteFolderPath: 'Journal',
			now: new Date(2026, 6, 22, 12, 0, 0),
			originalName: 'photo'
		});
	});

	it('handles vault-root notes', () => {
		const ctx = buildNameTemplateContext({
			ext: 'gif',
			noteFilePath: 'RootNote.md',
			now: new Date(2026, 0, 1),
			originalName: 'Pasted image 20260101120000'
		});
		expect(ctx.noteFileName).toBe('RootNote');
		expect(ctx.noteFilePath).toBe('RootNote');
		expect(ctx.noteFolderName).toBe('');
		expect(ctx.noteFolderPath).toBe('');
	});
});

describe('nextAvailablePath', () => {
	it('returns preferred path when free', () => {
		expect(nextAvailablePath('assets/photo.png', () => false)).toBe('assets/photo.png');
	});

	it('appends numeric suffixes like Obsidian', () => {
		const taken = new Set(['assets/photo.png', 'assets/photo 1.png']);
		expect(nextAvailablePath('assets/photo.png', (path) => taken.has(path))).toBe(
			'assets/photo 2.png'
		);
	});

	it('handles root-level files', () => {
		expect(nextAvailablePath('photo.png', (path) => path === 'photo.png')).toBe('photo 1.png');
	});
});
