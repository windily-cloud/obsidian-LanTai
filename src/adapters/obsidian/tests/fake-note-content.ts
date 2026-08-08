import { noopAsync } from 'obsidian-dev-utils/function';

import type {
	NoteContent,
	TextEdit
} from '../note-content.obsidian.ts';

export class FakeNoteContent implements NoteContent {
	private content: string;

	public constructor(content: string) {
		this.content = content;
	}

	public applyEdit(edit: TextEdit): Promise<boolean> {
		if (this.content.slice(edit.start, edit.end) !== edit.expected) {
			return Promise.resolve(false);
		}
		this.content = `${this.content.slice(0, edit.start)}${edit.replacement}${this.content.slice(edit.end)}`;
		return Promise.resolve(true);
	}

	public getContent(): string {
		return this.content;
	}

	public setContent(content: string): Promise<void> {
		this.content = content;
		return noopAsync();
	}
}
