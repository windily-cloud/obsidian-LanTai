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
import { t } from '../i18n/index.ts';
import { formatActionError } from '../storage/storage-credential-guard.ts';

interface CommandRegistrarConstructorParams {
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
		this.registerSingleImageCommand('upload', t('commands.uploadCurrent'));
		this.registerSingleImageCommand('localize', t('commands.localizeCurrent'));
		this.registerSingleImageCommand('download', t('commands.downloadCurrent'));
		this.plugin.addCommand({
			editorCallback: (editor, info) => this.runBatch('upload', editor, info),
			id: 'upload-all-local-images',
			name: t('commands.uploadAll')
		});
		this.plugin.addCommand({
			editorCallback: (editor, info) => this.runBatch('localize', editor, info),
			id: 'localize-all-remote-images',
			name: t('commands.localizeAll')
		});
		this.registerConvertCommand('wiki', t('commands.convertToWiki'));
		this.registerConvertCommand('markdown', t('commands.convertToMarkdown'));
	}

	private async createContext(
		editor: Editor,
		file: null | TFile
	): Promise<ImageActionContext | null> {
		if (!file) {
			new Notice(t('notices.openMarkdownNote'));
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
				t('notices.batchFinished', {
					action: action === 'upload'
						? t('commands.uploadActionName')
						: t('commands.localizeActionName'),
					failed: failures.length,
					succeeded: results.length - failures.length
				})
			);
			return;
		}
		if (action === 'upload') {
			return;
		}
		new Notice(t('notices.imagesProcessed', { count: results.length }));
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
		new Notice(
			action === 'download'
				? t('notices.downloadCompleted')
				: t('notices.localizeCompleted')
		);
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
				new Notice(t('notices.placeCursorOnImage'));
				return;
			}
			await this.executeOne(action, ref, context);
		} catch (error) {
			this.reportError(error);
		}
	}
}

function failureMessage(reason: 'conflict' | 'error' | 'missing'): string {
	switch (reason) {
		case 'conflict':
			return t('notices.failureConflict');
		case 'error':
			return t('notices.failureError');
		case 'missing':
			return t('notices.failureMissing');
		default: {
			const _exhaustive: never = reason;
			return _exhaustive;
		}
	}
}

function findRefAtCursor(
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
