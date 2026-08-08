import type {
	App,
	Editor,
	MarkdownFileInfo,
	Plugin,
	TFile
} from 'obsidian';

import { Notice } from 'obsidian';

import type { ActionResult } from '../actions/action-result.ts';
import type {
	ImageActionContext,
	ImageActionFacade
} from '../actions/image-action-facade.ts';
import type { ImageLinkService } from '../link/image-link-service.ts';
import type { ImageRef } from '../link/image-ref.ts';

import { ObsidianNoteContent } from '../adapters/obsidian/note-content.obsidian.ts';
import { formatActionError } from '../storage/storage-credential-guard.ts';

export interface CommandRegistrarConstructorParams {
	readonly app: App;
	readonly facade: ImageActionFacade;
	readonly linkService: ImageLinkService;
	readonly plugin: Plugin;
}

type SingleAction = 'download' | 'localize' | 'upload';

export class CommandRegistrar {
	private readonly app: App;
	private readonly facade: ImageActionFacade;
	private readonly linkService: ImageLinkService;
	private readonly plugin: Plugin;

	public constructor(params: CommandRegistrarConstructorParams) {
		this.app = params.app;
		this.facade = params.facade;
		this.linkService = params.linkService;
		this.plugin = params.plugin;
	}

	public register(): void {
		this.registerSingleImageCommand('upload', 'Upload current image');
		this.registerSingleImageCommand('localize', 'Localize current image');
		this.registerSingleImageCommand('download', 'Download current image');
		this.plugin.addCommand({
			editorCallback: (editor, info) => this.runBatch('upload', editor, info),
			id: 'upload-all-local-images',
			name: 'Upload all local images in current note'
		});
		this.plugin.addCommand({
			editorCallback: (editor, info) => this.runBatch('localize', editor, info),
			id: 'localize-all-remote-images',
			name: 'Localize all remote images in current note'
		});
		this.registerConvertCommand('wiki', 'Convert current note images to Wiki links');
		this.registerConvertCommand(
			'markdown',
			'Convert current note images to Markdown links'
		);
	}

	private async createContext(
		editor: Editor,
		file: null | TFile
	): Promise<ImageActionContext | null> {
		if (!file) {
			new Notice('Open a Markdown note first.');
			return null;
		}
		return {
			note: await ObsidianNoteContent.create({
				app: this.app,
				editor,
				file
			}),
			noteFilePath: file.path
		};
	}

	private async executeOne(
		action: SingleAction,
		ref: ImageRef,
		context: ImageActionContext
	): Promise<void> {
		let result: ActionResult;
		switch (action) {
			case 'download':
				result = await this.facade.downloadOne(ref, context);
				break;
			case 'localize':
				result = await this.facade.localizeOne(ref, context);
				break;
			case 'upload':
				result = await this.facade.uploadOne(ref, context);
				break;
			default: {
				const _exhaustive: never = action;
				return _exhaustive;
			}
		}
		this.reportResult(result, action);
	}

	private registerConvertCommand(
		style: 'markdown' | 'wiki',
		name: string
	): void {
		this.plugin.addCommand({
			editorCallback: (editor) => {
				editor.setValue(this.linkService.convertNote(editor.getValue(), style));
			},
			id: `convert-images-to-${style}`,
			name
		});
	}

	private registerSingleImageCommand(action: SingleAction, name: string): void {
		this.plugin.addCommand({
			editorCallback: (editor, info) => this.runCurrent(action, editor, info),
			id: `${action}-current-image`,
			name
		});
	}

	private reportBatch(results: ActionResult[], action: 'localize' | 'upload'): void {
		const failures = results.filter((result) => !result.ok);
		if (failures.length > 0) {
			new Notice(
				`${action === 'upload' ? 'Upload' : 'Localization'} finished: ${String(results.length - failures.length)} succeeded, ${String(failures.length)} failed.`
			);
			return;
		}
		if (action === 'upload') {
			return;
		}
		new Notice(`${String(results.length)} image(s) processed.`);
	}

	private reportError(error: unknown): void {
		console.error('LanTai action failed', error);
		new Notice(formatActionError(error));
	}

	private reportResult(result: ActionResult, action: SingleAction): void {
		if (!result.ok) {
			new Notice(result.message ?? failureMessage(result.reason));
			return;
		}
		if (result.cancelled || action === 'upload') {
			return;
		}
		new Notice(`${capitalize(action)} completed.`);
	}

	private async runBatch(
		action: 'localize' | 'upload',
		editor: Editor,
		info: MarkdownFileInfo
	): Promise<void> {
		try {
			const context = await this.createContext(editor, info.file);
			if (!context) {
				return;
			}
			const results = action === 'upload'
				? await this.facade.uploadAllLocalInNote(context)
				: await this.facade.localizeAllRemoteInNote(context);
			this.reportBatch(results, action);
		} catch (error) {
			this.reportError(error);
		}
	}

	private async runCurrent(
		action: SingleAction,
		editor: Editor,
		info: MarkdownFileInfo
	): Promise<void> {
		try {
			const context = await this.createContext(editor, info.file);
			if (!context) {
				return;
			}
			const ref = findRefAtCursor(
				this.facade.parseNote(context),
				editor.getLine(editor.getCursor().line),
				editor.getCursor().ch
			);
			if (!ref) {
				new Notice('Place the cursor on an image link first.');
				return;
			}
			await this.executeOne(action, ref, context);
		} catch (error) {
			this.reportError(error);
		}
	}
}

export function findRefAtCursor(
	refs: readonly ImageRef[],
	line: string,
	cursorColumn: number
): ImageRef | null {
	for (const ref of refs) {
		let index = line.indexOf(ref.source);
		while (index !== -1) {
			if (cursorColumn >= index && cursorColumn <= index + ref.source.length) {
				return ref;
			}
			index = line.indexOf(ref.source, index + ref.source.length);
		}
	}
	const onLine = refs.filter((ref) => line.includes(ref.source));
	return onLine.length === 1 ? (onLine[0] ?? null) : null;
}

function capitalize(value: string): string {
	return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function failureMessage(reason: 'conflict' | 'error' | 'missing'): string {
	switch (reason) {
		case 'conflict':
			return 'Target already exists; nothing was overwritten.';
		case 'error':
			return 'Image action failed.';
		case 'missing':
			return 'Required image or configuration was not found.';
		default: {
			const _exhaustive: never = reason;
			return _exhaustive;
		}
	}
}
