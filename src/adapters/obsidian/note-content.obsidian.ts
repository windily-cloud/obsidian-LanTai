import type {
	App,
	Editor,
	TFile
} from 'obsidian';

export interface NoteContent {
	applyEdit(edit: TextEdit): Promise<boolean>;
	getContent(): string;
	setContent(content: string): Promise<void>;
}

export interface TextEdit {
	readonly end: number;
	readonly expected: string;
	readonly replacement: string;
	readonly start: number;
}

interface ObsidianNoteContentConstructorParams {
	readonly app: App;
	readonly content: string;
	readonly editor?: Editor;
	readonly file: TFile;
}

interface ObsidianNoteContentCreateParams {
	readonly app: App;
	readonly editor?: Editor;
	readonly file: TFile;
}

export class ObsidianNoteContent implements NoteContent {
	private readonly app: App;
	private content: string;
	private readonly editor: Editor | undefined;
	private readonly file: TFile;

	public constructor(params: ObsidianNoteContentConstructorParams) {
		this.app = params.app;
		this.content = params.content;
		this.editor = params.editor;
		this.file = params.file;
	}

	public static async create(
		params: ObsidianNoteContentCreateParams
	): Promise<ObsidianNoteContent> {
		return new ObsidianNoteContent({
			...params,
			content: params.editor?.getValue() ?? (await params.app.vault.read(params.file))
		});
	}

	public async applyEdit(edit: TextEdit): Promise<boolean> {
		const content = this.getContent();
		if (content.slice(edit.start, edit.end) !== edit.expected) {
			return false;
		}
		const next = `${content.slice(0, edit.start)}${edit.replacement}${content.slice(edit.end)}`;
		if (this.editor) {
			this.editor.replaceRange(
				edit.replacement,
				this.editor.offsetToPos(edit.start),
				this.editor.offsetToPos(edit.end)
			);
			this.content = next;
			return true;
		}
		let applied = false;
		await this.app.vault.process(this.file, (current) => {
			if (current.slice(edit.start, edit.end) !== edit.expected) {
				return current;
			}
			applied = true;
			const processed = `${current.slice(0, edit.start)}${edit.replacement}${current.slice(edit.end)}`;
			this.content = processed;
			return processed;
		});
		return applied;
	}

	public getContent(): string {
		return this.editor?.getValue() ?? this.content;
	}

	public async setContent(content: string): Promise<void> {
		this.content = content;
		if (this.editor) {
			this.editor.setValue(content);
			return;
		}
		await this.app.vault.modify(this.file, content);
	}
}
