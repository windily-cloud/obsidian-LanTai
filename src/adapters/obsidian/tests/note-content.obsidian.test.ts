import type {
	App,
	Editor,
	EditorPosition,
	TFile,
	Vault
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

type ReplaceRange = (replacement: string, from: EditorPosition, to: EditorPosition) => void;

const BOM = '\uFEFF';

interface CreateNoteFileOptions {
	readonly stripBomOnRead?: boolean;
}

interface FakeNoteFile {
	readonly app: App;
	readonly file: TFile;
	getStored(): string;
}

function createNoteFile(initial: string, options?: CreateNoteFileOptions): FakeNoteFile {
	let stored = initial;
	const vault = fromPartial<Vault>({
		modify: vi.fn((_file: TFile, content: string): Promise<void> => {
			stored = content;
			return noopAsync();
		}),
		process: vi.fn(
			(_file: TFile, change: (content: string) => string): Promise<string> => {
				stored = change(stored);
				return Promise.resolve(stored);
			}
		),
		read: vi.fn(() =>
			Promise.resolve(
				options?.stripBomOnRead === false ? stored : stored.replace(BOM, '')
			)
		)
	});
	return {
		app: fromPartial<App>({ vault }),
		file: fromPartial<TFile>({ path: 'note.md' }),
		getStored: () => stored
	};
}

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

	it('applies edits when vault.process still sees the UTF-8 BOM', async () => {
		const local = '![](_assets/photo.png)';
		const remote = '![](https://cdn.example.com/photo.png)';
		const file = createNoteFile(`${BOM}${local}`);
		const note = await ObsidianNoteContent.create({ app: file.app, file: file.file });

		expect(note.getContent()).toBe(local);
		expect(
			await note.applyEdit({
				end: local.length,
				expected: local,
				replacement: remote,
				start: 0
			})
		).toBe(true);
		expect(file.getStored()).toBe(`${BOM}${remote}`);
		expect(note.getContent()).toBe(remote);
	});

	it('strips a BOM returned by vault.read without changing the stored file', async () => {
		const file = createNoteFile(`${BOM}![[same.png]]`, { stripBomOnRead: false });
		const note = await ObsidianNoteContent.create({ app: file.app, file: file.file });

		expect(note.getContent()).toBe('![[same.png]]');
		expect(
			await note.applyEdit({
				end: '![[same.png]]'.length,
				expected: '![[same.png]]',
				replacement: '![[new.png]]',
				start: 0
			})
		).toBe(true);
		expect(file.getStored()).toBe(`${BOM}![[new.png]]`);
	});

	it('keeps the BOM when the whole note is replaced', async () => {
		const file = createNoteFile(`${BOM}old content`);
		const note = await ObsidianNoteContent.create({ app: file.app, file: file.file });

		await note.setContent('new content');

		expect(file.getStored()).toBe(`${BOM}new content`);
		expect(note.getContent()).toBe('new content');
	});

	it('adjusts editor offsets when the editor value still carries a BOM', async () => {
		let content = `${BOM}![[same.png]]`;
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

		expect(note.getContent()).toBe('![[same.png]]');
		expect(
			await note.applyEdit({
				end: '![[same.png]]'.length,
				expected: '![[same.png]]',
				replacement: '![[new.png]]',
				start: 0
			})
		).toBe(true);
		expect(replaceRange).toHaveBeenCalledWith(
			'![[new.png]]',
			{ ch: 1, line: 0 },
			{ ch: '![[same.png]]'.length + 1, line: 0 }
		);
		expect(content).toBe(`${BOM}![[new.png]]`);
	});
});
