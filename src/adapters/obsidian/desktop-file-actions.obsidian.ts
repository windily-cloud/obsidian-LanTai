import type {
	App,
	TAbstractFile,
	TFile,
	TFolder,
	WorkspaceLeaf
} from 'obsidian';

import {
	FileSystemAdapter,
	FuzzySuggestModal,
	normalizePath
} from 'obsidian';
import { noopAsync } from 'obsidian-dev-utils/function';

interface BookmarkFileItem {
	readonly path: string;
	readonly type: 'file';
}

interface BookmarksPluginInstance {
	addItem?(item: BookmarkFileItem): void;
}

interface DesktopWindow extends Window {
	require?(moduleName: string): unknown;
}

interface ElectronDialog {
	showOpenDialog(options: ElectronOpenDialogOptions): Promise<ElectronOpenDialogResult>;
}

interface ElectronDialogFilter {
	readonly extensions: string[];
	readonly name: string;
}

interface ElectronFs {
	readFile(path: string): Promise<Buffer>;
}

interface ElectronModule {
	readonly dialog?: ElectronDialog;
	readonly remote?: ElectronRemote;
}

interface ElectronOpenDialogOptions {
	readonly filters?: ElectronDialogFilter[];
	readonly properties?: string[];
}

interface ElectronOpenDialogResult {
	readonly canceled: boolean;
	readonly filePaths: string[];
}

interface ElectronRemote {
	readonly dialog: ElectronDialog;
}

interface FileExplorerPlugin {
	revealInFolder(file: TAbstractFile): Promise<void> | void;
}

interface FileManagerWithRenamePrompt {
	promptForFileRename?(file: TFile): Promise<void>;
}

class FolderSuggestModal extends FuzzySuggestModal<TFolder> {
	private resolvePromise: ((value: null | TFolder) => void) | null = null;

	public constructor(app: App) {
		super(app);
		this.setPlaceholder('Move file to...');
	}

	public getItems(): TFolder[] {
		return this.app.vault.getAllFolders(true);
	}

	public getItemText(item: TFolder): string {
		return item.path || '/';
	}

	public onChooseItem(item: TFolder): void {
		this.resolvePromise?.(item);
		this.resolvePromise = null;
	}

	public override onClose(): void {
		super.onClose();
		if (this.resolvePromise) {
			this.resolvePromise(null);
			this.resolvePromise = null;
		}
	}

	public openAndGetValue(): Promise<null | TFolder> {
		return new Promise((resolve) => {
			this.resolvePromise = resolve;
			this.open();
		});
	}
}

export class ObsidianDesktopFileActions {
	public constructor(private readonly app: App) {}

	public getObsidianUrl(vaultPath: string): string {
		const vaultName = this.app.vault.getName();
		return `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(vaultPath)}`;
	}

	public async move(vaultPath: string): Promise<void> {
		const file = this.requireFile(vaultPath);
		const folder = await new FolderSuggestModal(this.app).openAndGetValue();
		if (!folder) {
			return;
		}
		const destination = normalizePath(`${folder.path}/${file.name}`);
		await this.app.fileManager.renameFile(file, destination);
	}

	public openDefault(vaultPath: string): Promise<void> {
		if (typeof this.app.openWithDefaultApp !== 'function') {
			throw new Error('Open with Default Application is unavailable in this Obsidian version.');
		}
		this.app.openWithDefaultApp(vaultPath);
		return noopAsync();
	}

	public async openInNewTab(vaultPath: string): Promise<void> {
		await this.openInLeaf(vaultPath, this.app.workspace.getLeaf(true));
	}

	public async openInNewTabGroup(vaultPath: string): Promise<void> {
		await this.openInLeaf(vaultPath, this.app.workspace.getLeaf('split'));
	}

	public async openInNewWindow(vaultPath: string): Promise<void> {
		await this.openInLeaf(vaultPath, this.app.workspace.openPopoutLeaf());
	}

	public async pickReplacementBytes(): Promise<null | Uint8Array> {
		const dialog = getElectronDialog();
		const result = await dialog.showOpenDialog({
			filters: [{ extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'], name: 'Images' }],
			properties: ['openFile']
		});
		if (result.canceled || result.filePaths.length === 0 || !result.filePaths[0]) {
			return null;
		}
		const fs = getElectronFs();
		const buffer = await fs.readFile(result.filePaths[0]);
		return new Uint8Array(buffer);
	}

	public async promptDelete(vaultPath: string): Promise<boolean> {
		const file = this.requireFile(vaultPath);
		if (typeof this.app.fileManager.promptForDeletion !== 'function') {
			return true;
		}
		return this.app.fileManager.promptForDeletion(file);
	}

	public async rename(vaultPath: string): Promise<void> {
		const file = this.requireFile(vaultPath);
		const fileManager = this.app.fileManager as FileManagerWithRenamePrompt;
		if (typeof fileManager.promptForFileRename !== 'function') {
			throw new Error('Rename is unavailable in this Obsidian version.');
		}
		await fileManager.promptForFileRename(file);
	}

	public async showInFileList(vaultPath: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(vaultPath);
		if (!file) {
			throw new Error(`Vault file was not found: ${vaultPath}`);
		}
		const fileExplorer = this.app.internalPlugins
			.getEnabledPluginById('file-explorer') as FileExplorerPlugin | null;
		if (!fileExplorer || typeof fileExplorer.revealInFolder !== 'function') {
			throw new Error('The Obsidian File Explorer is unavailable.');
		}
		await fileExplorer.revealInFolder(file);
	}

	public showInFolder(vaultPath: string): Promise<void> {
		if (typeof this.app.showInFolder !== 'function') {
			throw new Error('Show in Finder/File Explorer is unavailable in this Obsidian version.');
		}
		this.app.showInFolder(vaultPath);
		return noopAsync();
	}

	public star(vaultPath: string): Promise<void> {
		const bookmarks = this.app.internalPlugins
			.getEnabledPluginById('bookmarks') as BookmarksPluginInstance | null;
		if (!bookmarks || typeof bookmarks.addItem !== 'function') {
			throw new Error('The Obsidian Bookmarks plugin is unavailable.');
		}
		bookmarks.addItem({ path: vaultPath, type: 'file' });
		return noopAsync();
	}

	public toSystemPath(vaultPath: string): string {
		const adapter = this.app.vault.adapter;
		if (!(adapter instanceof FileSystemAdapter)) {
			throw new Error('The current vault does not expose a local file-system path.');
		}
		return adapter.getFullPath(vaultPath);
	}

	public writeText(text: string): Promise<void> {
		// Obsidian runs in Chromium; Node's navigator feature gate does not apply here.
		// eslint-disable-next-line n/no-unsupported-features/node-builtins -- desktop clipboard API
		return window.navigator.clipboard.writeText(text);
	}

	private async openInLeaf(vaultPath: string, leaf: WorkspaceLeaf): Promise<void> {
		const file = this.requireFile(vaultPath);
		await leaf.openFile(file);
	}

	private requireFile(vaultPath: string): TFile {
		const file = this.app.vault.getFileByPath(normalizePath(vaultPath));
		if (!file) {
			throw new Error(`Vault file was not found: ${vaultPath}`);
		}
		return file;
	}
}

function getElectron(): ElectronModule {
	const desktopWindow = window as DesktopWindow;
	const requireModule = desktopWindow.require?.bind(desktopWindow);
	if (!requireModule) {
		throw new Error('Electron APIs are unavailable.');
	}
	return requireModule('electron') as ElectronModule;
}

function getElectronDialog(): ElectronDialog {
	const electron = getElectron();
	const dialog = electron.dialog ?? electron.remote?.dialog;
	if (!dialog) {
		throw new Error('Electron dialog APIs are unavailable.');
	}
	return dialog;
}

function getElectronFs(): ElectronFs {
	const desktopWindow = window as DesktopWindow;
	const requireModule = desktopWindow.require?.bind(desktopWindow);
	if (!requireModule) {
		throw new Error('Electron file APIs are unavailable.');
	}
	return requireModule('fs/promises') as ElectronFs;
}
