import type {
	App,
	Editor,
	EditorPosition,
	TFile
} from 'obsidian';

import { fromPartial } from '@total-typescript/shoehorn';
import { noopAsync } from 'obsidian-dev-utils/function';
import {
	describe,
	expect,
	it,
	vi
} from 'vitest';

import { ObsidianNoteContent } from '../note-content.obsidian.ts';

const BOM = '\uFEFF';

type ReplaceRange = (replacement: string, from: EditorPosition, to: EditorPosition) => void;

describe('ObsidianNoteContent', () => {
	it('applies only the requested editor range', async () => {
		let content = '![[same.png]] then ![[same.png]]';
		const replaceRange = vi.fn<ReplaceRange>((replacement, from, to) => {
			content = `${content.slice(0, from.ch)}${replacement}${content.slice(to.ch)}`;
		});
		const editor = fromPartial<Editor>({
			getValue: () => content,
			offsetToPos: (offset: number) => ({ ch: offset, line: 0 }),
			replaceRange
		});
		const note = new ObsidianNoteContent({
			app: fromPartial<App>({}),
			content,
			editor,
			file: fromPartial<TFile>({})
		});

		const applied = await note.applyEdit({
			end: content.length,
			expected: '![[same.png]]',
			replacement: '![[new.png]]',
			start: content.lastIndexOf('![[same.png]]')
		});

		expect(applied).toBe(true);
		expect(content).toBe('![[same.png]] then ![[new.png]]');
		expect(replaceRange).toHaveBeenCalledOnce();
	});

	it('applies edits when the file content still carries a BOM', async () => {
		// Obsidian 的 vault.process 交给回调的内容保留 BOM，vault.read 读到的却不带，
		// 两者相差 1 个字符会让基于 read 算出的偏移全部失效。
		let onDisk = `${BOM}![[same.png]] tail`;
		const note = new ObsidianNoteContent({
			app: fromPartial<App>({
				vault: {
					process: (_file: TFile, fn: (data: string) => string): Promise<string> => {
						onDisk = fn(onDisk);
						return Promise.resolve(onDisk);
					}
				}
			}),
			content: '![[same.png]] tail',
			file: fromPartial<TFile>({})
		});

		const applied = await note.applyEdit({
			end: 13,
			expected: '![[same.png]]',
			replacement: '![[new.png]]',
			start: 0
		});

		expect(applied).toBe(true);
		expect(onDisk).toBe(`${BOM}![[new.png]] tail`);
		expect(note.getContent()).toBe('![[new.png]] tail');
	});

	it('keeps the BOM when the whole note is replaced', async () => {
		let onDisk = `${BOM}old`;
		const note = new ObsidianNoteContent({
			app: fromPartial<App>({
				vault: {
					modify: (_file: TFile, data: string): Promise<void> => {
						onDisk = data;
						return noopAsync();
					}
				}
			}),
			content: `${BOM}old`,
			file: fromPartial<TFile>({})
		});

		await note.setContent('new');

		expect(onDisk).toBe(`${BOM}new`);
		expect(note.getContent()).toBe('new');
	});

	it('rejects a stale range without editing', async () => {
		const replaceRange = vi.fn();
		const editor = fromPartial<Editor>({
			getValue: () => 'changed ![[same.png]]',
			offsetToPos: vi.fn(),
			replaceRange
		});
		const note = new ObsidianNoteContent({
			app: fromPartial<App>({}),
			content: '![[same.png]]',
			editor,
			file: fromPartial<TFile>({})
		});

		expect(
			await note.applyEdit({
				end: 14,
				expected: '![[same.png]]',
				replacement: '![[new.png]]',
				start: 0
			})
		).toBe(false);
		expect(replaceRange).not.toHaveBeenCalled();
	});
});
