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
	private hasByteOrderMark: boolean;

	public constructor(params: ObsidianNoteContentConstructorParams) {
		this.app = params.app;
		this.content = stripByteOrderMark(params.content);
		this.editor = params.editor;
		this.file = params.file;
		this.hasByteOrderMark = params.content.startsWith(BYTE_ORDER_MARK);
	}

	public static async create(
		params: ObsidianNoteContentCreateParams
	): Promise<ObsidianNoteContent> {
		return new ObsidianNoteContent({
			...params,
			content: params.editor?.getValue() ?? (await params.app.vault.read(params.file))
		});
	}

	/**
	 * 编辑以 UTF-8 BOM 开头的笔记。
	 *
	 * Obsidian 的 `vault.read` 与 `vault.process` 对 BOM 的处理并不一致（后者交给回调的内容
	 * 仍保留 BOM 字符），两者相差 1 个字符就会让基于 `vault.read` 算出的偏移全部失效，
	 * 于是每一次 CAS 改写都判定为「链接已变更」。这里统一按**剥离 BOM 的视图**计算偏移，
	 * 写回时再把 BOM 原样补回去，文件内容因此不会被改动。
	 */
	public async applyEdit(edit: TextEdit): Promise<boolean> {
		const content = this.getContent();
		if (content.slice(edit.start, edit.end) !== edit.expected) {
			return false;
		}
		const next = `${content.slice(0, edit.start)}${edit.replacement}${content.slice(edit.end)}`;
		if (this.editor) {
			const offset = this.editorOffset();
			this.hasByteOrderMark = offset === 1;
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
			const view = stripByteOrderMark(current);
			if (view.slice(edit.start, edit.end) !== edit.expected) {
				return current;
			}
			applied = true;
			this.content = next;
			this.hasByteOrderMark = current.startsWith(BYTE_ORDER_MARK);
			return restoreByteOrderMark(current, next);
		});
		return applied;
	}

	public getContent(): string {
		return stripByteOrderMark(this.editor?.getValue() ?? this.content);
	}

	public async setContent(content: string): Promise<void> {
		this.content = stripByteOrderMark(content);
		if (this.editor) {
			this.editor.setValue(this.withByteOrderMark(this.content));
			return;
		}
		await this.app.vault.modify(this.file, this.withByteOrderMark(this.content));
	}

	/** 编辑器内容保留 BOM 时，偏移需要整体后移 1 个字符。 */
	private editorOffset(): number {
		const raw = this.editor?.getValue() ?? '';
		return raw.startsWith(BYTE_ORDER_MARK) ? 1 : 0;
	}

	/** 写回文件/编辑器时恢复笔记原本的 BOM，避免顺手改掉用户的文件编码。 */
	private withByteOrderMark(content: string): string {
		return this.hasByteOrderMark ? `${BYTE_ORDER_MARK}${content}` : content;
	}
}

const BYTE_ORDER_MARK = '\uFEFF';

function restoreByteOrderMark(original: string, content: string): string {
	return original.startsWith(BYTE_ORDER_MARK) ? `${BYTE_ORDER_MARK}${content}` : content;
}

function stripByteOrderMark(text: string): string {
	return text.startsWith(BYTE_ORDER_MARK) ? text.slice(1) : text;
}
