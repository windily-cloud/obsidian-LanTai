import { noopAsync } from 'obsidian-dev-utils/function';

import type { BrowserDownload } from '../browser-download.obsidian.ts';

interface SavedBrowserDownload {
	readonly bytes: Uint8Array;
	readonly fileName: string;
}

/** Test double for BrowserDownload. */
export class FakeBrowserDownload implements BrowserDownload {
	/** Exposed for unit tests. */
	public readonly saved: SavedBrowserDownload[] = [];

	public save(fileName: string, bytes: Uint8Array): Promise<void> {
		this.saved.push({ bytes, fileName });
		return noopAsync();
	}
}
