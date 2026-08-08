export interface ObsidianSaveDialogConstructorOptions {
	readonly pickPath?: SavePathPicker;
}

export interface SaveDialog {
	pickSavePath(defaultFileName: string): Promise<null | string>;
	writeOsFile(path: string, bytes: Uint8Array): Promise<void>;
}

export type SavePathPicker = (defaultFileName: string) => null | string;

interface ElectronDialog {
	showSaveDialogSync(options: ElectronSaveDialogOptions): string | undefined;
}

interface ElectronModule {
	dialog?: ElectronDialog;
	remote?: ElectronRemote;
}

interface ElectronRemote {
	readonly dialog: ElectronDialog;
}

interface ElectronSaveDialogOptions {
	readonly defaultPath: string;
}

interface ElectronWindow extends Window {
	require?(moduleName: string): unknown;
}

interface NodeFileSystem {
	readonly promises: NodeFileSystemPromises;
}

interface NodeFileSystemPromises {
	writeFile(path: string, bytes: Uint8Array): Promise<void>;
}

export class ObsidianSaveDialog implements SaveDialog {
	private readonly pickPath: (defaultFileName: string) => null | string;

	public constructor(options: ObsidianSaveDialogConstructorOptions = {}) {
		this.pickPath = options.pickPath ?? pickWithElectron;
	}

	public pickSavePath(defaultFileName: string): Promise<null | string> {
		return Promise.resolve(this.pickPath(defaultFileName));
	}

	public async writeOsFile(path: string, bytes: Uint8Array): Promise<void> {
		const requireModule = getElectronRequire();
		const fileSystem = requireModule('fs') as NodeFileSystem;
		await fileSystem.promises.writeFile(path, bytes);
	}
}

function getElectronRequire(): NonNullable<ElectronWindow['require']> {
	const electronWindow = window as ElectronWindow;
	const requireModule = electronWindow.require?.bind(electronWindow);
	if (!requireModule) {
		throw new Error('Electron APIs are unavailable');
	}
	return requireModule.bind(electronWindow);
}

function pickWithElectron(defaultFileName: string): null | string {
	const requireModule = getElectronRequire();
	let electron: ElectronModule;
	try {
		electron = requireModule('@electron/remote') as ElectronModule;
	} catch {
		electron = requireModule('electron') as ElectronModule;
	}
	const dialog = electron.dialog ?? electron.remote?.dialog;
	if (!dialog) {
		throw new Error('Electron save dialog is unavailable');
	}
	return dialog.showSaveDialogSync({ defaultPath: defaultFileName }) ?? null;
}
