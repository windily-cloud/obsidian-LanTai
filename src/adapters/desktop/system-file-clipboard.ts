import { t } from '../../i18n/index.ts';

interface ChildProcessModule {
	execFile(
		command: string,
		args: readonly string[],
		callback: (error: Error | null) => void
	): void;
}

interface DesktopWindow extends Window {
	require?(moduleName: string): unknown;
}

interface ProcessModule {
	readonly platform: NodeJS.Platform;
}

type SystemCommandRunner = (command: string, args: readonly string[]) => Promise<void>;

interface SystemFileClipboardConstructorOptions {
	readonly platform?: NodeJS.Platform;
	readonly run?: SystemCommandRunner;
}

/** Exposed for unit tests. */
export class SystemFileClipboard {
	private readonly platform: NodeJS.Platform | undefined;
	private readonly run: SystemCommandRunner;

	public constructor(options: SystemFileClipboardConstructorOptions = {}) {
		this.platform = options.platform;
		this.run = options.run ?? runCommand;
	}

	/** Exposed for unit tests. */
	public async copy(filePath: string): Promise<void> {
		const platform = this.platform ?? getProcessModule().platform;
		switch (platform) {
			case 'darwin':
				await this.copyOnMacOS(filePath);
				return;
			case 'win32':
				await this.copyOnWindows(filePath);
				return;
			default:
				throw new Error(t('errors.copyFilePlatformOnly'));
		}
	}

	private async copyOnMacOS(filePath: string): Promise<void> {
		await this.run('open', ['-R', filePath]);
		await this.run('osascript', [
			'-e',
			[
				'tell application "System Events"',
				'delay 0.2',
				'keystroke "c" using command down',
				'end tell',
				'tell application id "md.obsidian" to activate'
			].join('\n')
		]);
	}

	private async copyOnWindows(filePath: string): Promise<void> {
		await this.run('powershell.exe', [
			'-STA',
			'-NoProfile',
			'-NonInteractive',
			'-Command',
			[
				'& { param([string]$path)',
				'Add-Type -AssemblyName System.Windows.Forms;',
				'$files = New-Object System.Collections.Specialized.StringCollection;',
				'[void]$files.Add($path);',
				'[Windows.Forms.Clipboard]::SetFileDropList($files)',
				'}'
			].join(' '),
			filePath
		]);
	}
}

function getDesktopRequire(): NonNullable<DesktopWindow['require']> {
	const desktopWindow = window as DesktopWindow;
	const requireModule = desktopWindow.require?.bind(desktopWindow);
	if (!requireModule) {
		throw new Error(t('errors.desktopSystemApisUnavailable'));
	}
	return requireModule;
}

function getProcessModule(): ProcessModule {
	return getDesktopRequire()('process') as ProcessModule;
}

async function runCommand(command: string, args: readonly string[]): Promise<void> {
	const childProcess = getDesktopRequire()('child_process') as ChildProcessModule;
	await new Promise<void>((resolve, reject) => {
		childProcess.execFile(command, args, (error) => {
			if (error) {
				reject(error);
				return;
			}
			resolve();
		});
	});
}
