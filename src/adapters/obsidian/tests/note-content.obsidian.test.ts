import type {
	App,
	Editor,
	EditorPosition,
	TFile
} from 'obsidian';

import { fromPartial } from '@total-typescript/shoehorn';
import {
	describe,
	expect,
	it,
	vi
} from 'vitest';

import { ObsidianNoteContent } from '../note-content.obsidian.ts';

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
