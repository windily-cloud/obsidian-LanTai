import type {
	App,
	Plugin
} from 'obsidian';

import {
	MarkdownView,
	Menu,
	Notice,
	Platform
} from 'obsidian';

import type { ActionResult } from '../actions/action-result.ts';
import type {
	ImageActionContext,
	ImageActionFacade
} from '../actions/image-action-facade.ts';
import type { ImageFileActions } from '../actions/image-file-actions.ts';
import type { ImageLinkService } from '../link/image-link-service.ts';
import type {
	ImageLayout,
	ImageRef
} from '../link/image-ref.ts';
import type {
	ImageMenuItemKey,
	ImageSourceRange,
	ImageTarget,
	RenderedImageIdentity
} from './resolve-rendered-image.ts';

import { ObsidianNoteContent } from '../adapters/obsidian/note-content.obsidian.ts';
import { t } from '../i18n/index.ts';
import { formatActionError } from '../storage/storage-credential-guard.ts';
import {
	findRenderedImageRef,
	lineRangeFromElement,
	menuCapabilities,
	readRenderedImageIdentity,
	selectPreciseImageOffset,
	toImageTarget,
	visibleImageMenuGroups
} from './resolve-rendered-image.ts';

export type { ImageSourceRange } from './resolve-rendered-image.ts';
export { findRenderedImageRef } from './resolve-rendered-image.ts';

const IMAGE_SELECTOR = '.workspace-leaf-content[data-type=\'markdown\'] .markdown-source-view img';

export interface ImageContextMenuControllerConstructorParams {
	readonly app: App;
	readonly facade: ImageActionFacade;
	readonly fileActions: ImageFileActions;
	readonly linkService: ImageLinkService;
	readonly plugin: Plugin;
}

type ContextAction = 'download' | 'localize' | 'upload';

type NativeFileAction =
	| 'copy-absolute-path'
	| 'copy-image'
	| 'copy-obsidian-url'
	| 'copy-vault-path'
	| 'delete-file'
	| 'move'
	| 'open-new-tab-group'
	| 'open-new-tab'
	| 'open-new-window'
	| 'open'
	| 'rename'
	| 'replace'
	| 'show-in-file-list'
	| 'show-in-folder'
	| 'star';

interface ResolvedMenuTarget {
	readonly capabilities: ReturnType<typeof menuCapabilities>;
	readonly context: ImageActionContext;
	readonly identity: RenderedImageIdentity;
	readonly ref: ImageRef | null;
	readonly target: ImageTarget;
}

export class ImageContextMenuController {
	private readonly app: App;
	private readonly documents = new WeakSet<Document>();
	private readonly facade: ImageActionFacade;
	private readonly fileActions: ImageFileActions;
	private readonly linkService: ImageLinkService;
	private readonly plugin: Plugin;

	public constructor(params: ImageContextMenuControllerConstructorParams) {
		this.app = params.app;
		this.facade = params.facade;
		this.fileActions = params.fileActions;
		this.linkService = params.linkService;
		this.plugin = params.plugin;
	}

	public register(): void {
		this.listenOn(document);
		for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
			this.listenOn(leaf.view.containerEl.ownerDocument);
		}
		this.plugin.registerEvent(
			this.app.workspace.on('window-open', (_workspaceWindow, ownerWindow) => {
				this.listenOn(ownerWindow.document);
			})
		);
	}

	private addMenuItem(
		menu: Menu,
		itemKey: ImageMenuItemKey,
		resolved: ResolvedMenuTarget,
		isMacOS: boolean,
		ref: ImageRef | null
	): void {
		switch (itemKey) {
			case 'copy':
				menu.addItem((item) => {
					item
						.setTitle(t('menu.copyImage'))
						.setIcon('copy')
						.onClick(() => this.executeNativeAction('copy-image', resolved));
				});
				return;
			case 'copyPath':
				menu.addItem((item) => {
					const submenu = item
						.setTitle(t('menu.copyPath'))
						.setIcon('link')
						.setSubmenu();
					submenu.addItem((pathItem) => {
						pathItem
							.setTitle(t('menu.copyVaultPath'))
							.onClick(() => this.executeNativeAction('copy-vault-path', resolved));
					});
					submenu.addItem((pathItem) => {
						pathItem
							.setTitle(t('menu.copyAbsolutePath'))
							.onClick(() => this.executeNativeAction('copy-absolute-path', resolved));
					});
					submenu.addItem((pathItem) => {
						pathItem
							.setTitle(t('menu.copyObsidianUrl'))
							.onClick(() => this.executeNativeAction('copy-obsidian-url', resolved));
					});
				});
				return;
			case 'deleteFile':
				menu.addItem((item) => {
					item
						.setTitle(t('menu.deleteImage'))
						.setIcon('trash')
						.onClick(() => this.executeNativeAction('delete-file', resolved));
				});
				return;
			case 'download':
				menu.addItem((item) => {
					item
						.setTitle(t('menu.downloadImage'))
						.setIcon('save')
						.onClick(() => this.execute('download', resolved));
				});
				return;
			case 'layout':
				menu.addItem((item) => {
					const submenu = item
						.setTitle(t('menu.layout'))
						.setIcon('panel-top')
						.setSubmenu();
					for (
						const layout of [
							{ key: 'right' as const, title: t('menu.layoutRight') },
							{ key: 'left' as const, title: t('menu.layoutLeft') },
							{ key: 'center' as const, title: t('menu.layoutCenter') }
						]
					) {
						submenu.addItem((layoutItem) => {
							layoutItem
								.setTitle(layout.title)
								.setChecked(ref !== null && this.linkService.getLayout(ref) === layout.key)
								.onClick(() => {
									if (!ref) {
										new Notice('Could not locate the image link in the note.');
										return;
									}
									return this.setLayout(ref, layout.key, resolved.context);
								});
						});
					}
				});
				return;
			case 'localize':
				menu.addItem((item) => {
					item
						.setTitle(t('menu.localizeImage'))
						.setIcon('download')
						.onClick(() => this.execute('localize', resolved));
				});
				return;
			case 'move':
				menu.addItem((item) => {
					item
						.setTitle(t('menu.moveFileTo'))
						.setIcon('folder-input')
						.onClick(() => this.executeNativeAction('move', resolved));
				});
				return;
			case 'openInNewTab':
				menu.addItem((item) => {
					item
						.setTitle(t('menu.openInNewTab'))
						.setIcon('lucide-file-plus')
						.onClick(() => this.executeNativeAction('open-new-tab', resolved));
				});
				return;
			case 'openInNewTabGroup':
				menu.addItem((item) => {
					item
						.setTitle(t('menu.openInNewTabGroup'))
						.setIcon('lucide-columns-2')
						.onClick(() => this.executeNativeAction('open-new-tab-group', resolved));
				});
				return;
			case 'openInNewWindow':
				menu.addItem((item) => {
					item
						.setTitle(t('menu.openInNewWindow'))
						.setIcon('lucide-app-window')
						.onClick(() => this.executeNativeAction('open-new-window', resolved));
				});
				return;
			case 'openWithDefaultApp':
				menu.addItem((item) => {
					item
						.setTitle(t('menu.openWithDefaultApp'))
						.setIcon('external-link')
						.onClick(() => this.executeNativeAction('open', resolved));
				});
				return;
			case 'remove':
				menu.addItem((item) => {
					item
						.setTitle(t('menu.removeImage'))
						.setIcon('lucide-image-off')
						.onClick(() => this.removeEmbed(resolved));
				});
				return;
			case 'rename':
				menu.addItem((item) => {
					item
						.setTitle(t('menu.rename'))
						.setIcon('pencil')
						.onClick(() => this.executeNativeAction('rename', resolved));
				});
				return;
			case 'replace':
				menu.addItem((item) => {
					item
						.setTitle(t('menu.replaceContent'))
						.setIcon('replace')
						.onClick(() => this.executeNativeAction('replace', resolved));
				});
				return;
			case 'resetSize':
				menu.addItem((item) => {
					item
						.setTitle(t('menu.resetSize'))
						.setIcon('fullscreen')
						.onClick(() => this.resetSize(resolved));
				});
				return;
			case 'showInFileList':
				menu.addItem((item) => {
					item
						.setTitle(t('menu.showInFileList'))
						.setIcon('folder-tree')
						.onClick(() => this.executeNativeAction('show-in-file-list', resolved));
				});
				return;
			case 'showInFolder':
				menu.addItem((item) => {
					item
						.setTitle(t('menu.showInFolder', { isMacOS }))
						.setIcon('folder-open')
						.onClick(() => this.executeNativeAction('show-in-folder', resolved));
				});
				return;
			case 'star':
				menu.addItem((item) => {
					item
						.setTitle(t('menu.star'))
						.setIcon('star')
						.onClick(() => this.executeNativeAction('star', resolved));
				});
				return;
			case 'upload':
				menu.addItem((item) => {
					item
						.setTitle(t('menu.uploadImage'))
						.setIcon('upload')
						.onClick(() => this.execute('upload', resolved));
				});
				return;
			default: {
				const _exhaustive: never = itemKey;
				return _exhaustive;
			}
		}
	}

	private async applyLinkEdit(
		ref: ImageRef,
		replacement: string,
		context: ImageActionContext,
		conflictMessage: string
	): Promise<boolean> {
		const applied = await context.note.applyEdit({
			end: ref.end,
			expected: ref.source,
			replacement,
			start: ref.start
		});
		if (!applied) {
			new Notice(conflictMessage);
		}
		return applied;
	}

	private async execute(
		action: ContextAction,
		resolved: ResolvedMenuTarget
	): Promise<void> {
		try {
			let result: ActionResult;
			switch (action) {
				case 'download':
					result = await this.facade.downloadOne(resolved.target, resolved.context);
					break;
				case 'localize':
					if (!resolved.ref) {
						new Notice('Could not uniquely match this image to a note link.');
						return;
					}
					result = await this.facade.localizeOne(resolved.ref, resolved.context);
					break;
				case 'upload':
					if (!resolved.ref) {
						new Notice('Could not uniquely match this image to a note link.');
						return;
					}
					result = await this.facade.uploadOne(resolved.ref, resolved.context);
					break;
				default: {
					const _exhaustive: never = action;
					return _exhaustive;
				}
			}
			if (!result.ok) {
				new Notice(result.message ?? 'Image action failed.');
			} else if (!result.cancelled && action !== 'upload') {
				new Notice('Image action completed.');
			}
		} catch (error) {
			this.reportError(error);
		}
	}

	private async executeNativeAction(
		action: NativeFileAction,
		resolved: ResolvedMenuTarget
	): Promise<void> {
		try {
			const { context, target } = resolved;
			switch (action) {
				case 'copy-absolute-path':
					await this.fileActions.copyAbsolutePath(target, context.noteFilePath);
					return;
				case 'copy-image':
					await this.fileActions.copyImage(target, context.noteFilePath);
					new Notice('Image copied to clipboard.');
					return;
				case 'copy-obsidian-url':
					await this.fileActions.copyObsidianUrl(target, context.noteFilePath);
					return;
				case 'copy-vault-path':
					await this.fileActions.copyVaultPath(target, context.noteFilePath);
					return;
				case 'delete-file': {
					if (resolved.ref) {
						const removed = await this.applyLinkEdit(
							resolved.ref,
							this.linkService.formatRemoveEmbed(),
							context,
							'The image link changed before it could be removed.'
						);
						if (!removed) {
							return;
						}
					}
					await this.fileActions.deleteFile(target, context.noteFilePath);
					return;
				}
				case 'move':
					await this.fileActions.move(target, context.noteFilePath);
					return;
				case 'open':
					await this.fileActions.open(target, context.noteFilePath);
					return;
				case 'open-new-tab':
					await this.fileActions.openInNewTab(target, context.noteFilePath);
					return;
				case 'open-new-tab-group':
					await this.fileActions.openInNewTabGroup(target, context.noteFilePath);
					return;
				case 'open-new-window':
					await this.fileActions.openInNewWindow(target, context.noteFilePath);
					return;
				case 'rename':
					await this.fileActions.rename(target, context.noteFilePath);
					return;
				case 'replace': {
					const replaced = await this.fileActions.replaceContent(target, context.noteFilePath);
					if (replaced) {
						new Notice('Image content replaced.');
					}
					return;
				}
				case 'show-in-file-list':
					await this.fileActions.showInFileList(target, context.noteFilePath);
					return;
				case 'show-in-folder':
					await this.fileActions.showInFolder(target, context.noteFilePath);
					return;
				case 'star':
					await this.fileActions.star(target, context.noteFilePath);
					return;
				default: {
					const _exhaustive: never = action;
					return _exhaustive;
				}
			}
		} catch (error) {
			this.reportError(error);
		}
	}

	private findMarkdownView(image: HTMLImageElement): MarkdownView {
		const matches = this.app.workspace
			.getLeavesOfType('markdown')
			.map((leaf) => leaf.view)
			.filter(
				(view): view is MarkdownView =>
					view instanceof MarkdownView
					&& view.containerEl.contains(image)
			);
		if (matches.length !== 1 || !matches[0]) {
			throw new Error('Could not find the Markdown view for this image.');
		}
		return matches[0];
	}

	private findOpenSourceView(sourcePath: string, hostView: MarkdownView): MarkdownView | null {
		if (hostView.file?.path === sourcePath) {
			return hostView;
		}
		const matches = this.app.workspace
			.getLeavesOfType('markdown')
			.map((leaf) => leaf.view)
			.filter(
				(view): view is MarkdownView => view instanceof MarkdownView && view.file?.path === sourcePath
			);
		if (matches.length > 1) {
			throw new Error('The source note is open in multiple panes; close duplicate panes before editing this image.');
		}
		return matches[0] ?? null;
	}

	private async handleContextMenu(event: MouseEvent): Promise<void> {
		const target = event.target;
		if (!isElement(target)) {
			return;
		}
		const image = target.closest<HTMLImageElement>(IMAGE_SELECTOR);
		if (!image) {
			return;
		}
		try {
			const view = this.findMarkdownView(image);
			// Reading/preview mode is owned by Obsidian's native image menu.
			if (view.getMode() === 'preview') {
				return;
			}
			event.preventDefault();
			if (!view.file) {
				new Notice('Open a Markdown note first.');
				return;
			}
			const identity = readRenderedImageIdentity(image);
			if (!identity) {
				new Notice('Could not identify this image.');
				return;
			}
			const sourcePath = view.file.path;
			const sourceFile = this.app.vault.getFileByPath(sourcePath);
			if (!sourceFile) {
				new Notice('Could not find the source note for this image.');
				return;
			}
			const sourceView = this.findOpenSourceView(sourcePath, view);
			const context: ImageActionContext = {
				note: await ObsidianNoteContent.create({
					app: this.app,
					...(sourceView ? { editor: sourceView.editor } : {}),
					file: sourceFile
				}),
				noteFilePath: sourcePath
			};
			const root = image.closest('.markdown-source-view, .cm-editor') ?? view.containerEl;
			const refs = this.facade.parseNote(context);
			const ref = findRenderedImageRef(
				refs,
				image,
				root,
				findImageSourceRange(image, event, view, context.note.getContent(), refs)
			);
			const imageTarget = toImageTarget(identity, ref);
			this.showMenu(event, {
				capabilities: menuCapabilities({ identity, ref }),
				context,
				identity,
				ref,
				target: imageTarget
			});
		} catch (error) {
			this.reportError(error);
		}
	}

	private listenOn(ownerDocument: Document): void {
		if (this.documents.has(ownerDocument)) {
			return;
		}
		this.documents.add(ownerDocument);
		this.plugin.registerDomEvent(ownerDocument, 'contextmenu', (event) => this.handleContextMenu(event));
	}

	private async removeEmbed(resolved: ResolvedMenuTarget): Promise<void> {
		if (!resolved.ref) {
			return;
		}
		try {
			await this.applyLinkEdit(
				resolved.ref,
				this.linkService.formatRemoveEmbed(),
				resolved.context,
				'The image link changed before it could be removed.'
			);
		} catch (error) {
			this.reportError(error);
		}
	}

	private reportError(error: unknown): void {
		console.error('LanTai context menu action failed', error);
		new Notice(formatActionError(error));
	}

	private async resetSize(resolved: ResolvedMenuTarget): Promise<void> {
		if (!resolved.ref) {
			return;
		}
		try {
			await this.applyLinkEdit(
				resolved.ref,
				this.linkService.formatResetSize(resolved.ref),
				resolved.context,
				'The image link changed before its size could be reset.'
			);
		} catch (error) {
			this.reportError(error);
		}
	}

	private async setLayout(
		ref: ImageRef,
		layout: ImageLayout,
		context: ImageActionContext
	): Promise<void> {
		try {
			await this.applyLinkEdit(
				ref,
				this.linkService.formatLayout(ref, layout),
				context,
				'The image link changed before its layout could be updated.'
			);
		} catch (error) {
			this.reportError(error);
		}
	}

	private showMenu(
		event: MouseEvent,
		resolved: ResolvedMenuTarget
	): void {
		const { capabilities, ref } = resolved;
		const menu = new Menu();
		const isMacOS = Platform.isMacOS;
		const groups = visibleImageMenuGroups(capabilities);

		for (const [groupIndex, group] of groups.entries()) {
			if (groupIndex > 0) {
				menu.addSeparator();
			}
			for (const itemKey of group) {
				this.addMenuItem(menu, itemKey, resolved, isMacOS, ref);
			}
		}
		menu.showAtMouseEvent(event);
	}
}
export function findImageSourceRange(
	image: HTMLImageElement,
	event: MouseEvent,
	view: MarkdownView,
	content: string,
	refs: readonly ImageRef[] = []
): ImageSourceRange | undefined {
	try {
		const codeMirror = view.editor.activeCM ?? view.editor.cm;
		let domPosition: null | number = null;
		let coordinatePosition: null | number = null;
		try {
			if (codeMirror.contentDOM.contains(image)) {
				domPosition = codeMirror.posAtDOM(image);
			}
		} catch {
			// Image widgets can throw from posAtDOM even when nested under contentDOM.
		}
		try {
			coordinatePosition = codeMirror.posAtCoords({
				x: event.clientX,
				y: event.clientY
			}) ?? null;
		} catch {
			// Coordinates are best-effort in Live Preview.
		}
		const position = selectPreciseImageOffset({
			coordinatePosition,
			domPosition,
			refs
		});
		if (position !== null) {
			return { end: position, precise: true, start: position };
		}
	} catch {
		// Fall through to data-line based ranges when CM is unavailable.
	}
	return lineRangeFromElement(image, content);
}

function isElement(target: EventTarget | null): target is Element {
	return target !== null && 'closest' in target;
}
