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

const BOM = '\uFEFF';

/**
 * `vault.read()` and the `vault.process()` callback disagree about UTF-8 BOM:
 * reads may hide it while process still returns it. Every offset in `TextEdit`
 * therefore belongs to the BOM-less view, and the BOM is restored on write.
 */
export class ObsidianNoteContent implements NoteContent {
	private readonly app: App;
	private content: string;
	private readonly editor: Editor | undefined;
	private readonly file: TFile;

	public constructor(params: ObsidianNoteContentConstructorParams) {
		this.app = params.app;
		this.content = stripBom(params.content);
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
			const editorValue = this.editor.getValue();
			const offset = editorValue.startsWith(BOM) ? BOM.length : 0;
			this.editor.replaceRange(
				edit.replacement,
				this.editor.offsetToPos(edit.start + offset),
				this.editor.offsetToPos(edit.end + offset)
			);
			this.content = next;
			return true;
		}
		let applied = false;
		await this.app.vault.process(this.file, (current) => {
			const hasBom = current.startsWith(BOM);
			const visible = stripBom(current);
			if (visible.slice(edit.start, edit.end) !== edit.expected) {
				return current;
			}
			applied = true;
			const processed = `${visible.slice(0, edit.start)}${edit.replacement}${visible.slice(edit.end)}`;
			this.content = processed;
			return hasBom ? `${BOM}${processed}` : processed;
		});
		return applied;
	}

	public getContent(): string {
		return stripBom(this.editor?.getValue() ?? this.content);
	}

	public async setContent(content: string): Promise<void> {
		const visible = stripBom(content);
		this.content = visible;
		if (this.editor) {
			const hasBom = content.startsWith(BOM) || this.editor.getValue().startsWith(BOM);
			this.editor.setValue(hasBom ? `${BOM}${visible}` : visible);
			return;
		}
		await this.app.vault.process(this.file, (current) => {
			const hasBom = content.startsWith(BOM) || current.startsWith(BOM);
			return hasBom ? `${BOM}${visible}` : visible;
		});
	}
}

function stripBom(content: string): string {
	return content.startsWith(BOM) ? content.slice(BOM.length) : content;
}
