import { noopAsync } from 'obsidian-dev-utils/function';

import type { SaveDialog } from '../save-dialog.obsidian.ts';

export interface FakeSaveDialogConstructorOptions {
	readonly picked?: null | string;
}

export class FakeSaveDialog implements SaveDialog {
	public readonly written = new Map<string, Uint8Array>();
	private readonly picked: null | string;

	public constructor(options: FakeSaveDialogConstructorOptions = {}) {
		this.picked = options.picked ?? null;
	}

	public pickSavePath(_defaultFileName: string): Promise<null | string> {
		return Promise.resolve(this.picked);
	}

	public writeOsFile(path: string, bytes: Uint8Array): Promise<void> {
		this.written.set(path, bytes);
		return noopAsync();
	}
}
