import type { BrowserDownload } from './browser-download.obsidian.ts';

interface VaultAttachmentDownloadConstructorParams {
	exists(path: string): Promise<boolean>;
	notify(path: string): void;
	resolveDestination(fileName: string): string;
	writeBinary(path: string, bytes: Uint8Array): Promise<void>;
}

/**
 * Mobile-friendly BrowserDownload: saves image bytes into the vault attachment
 * tree instead of using an `<a download>` anchor (unreliable in mobile webviews).
 */
export class VaultAttachmentDownload implements BrowserDownload {
	private readonly params: VaultAttachmentDownloadConstructorParams;

	public constructor(params: VaultAttachmentDownloadConstructorParams) {
		this.params = params;
	}

	public async save(fileName: string, bytes: Uint8Array): Promise<void> {
		const path = await this.uniquePath(this.params.resolveDestination(fileName));
		await this.params.writeBinary(path, bytes);
		this.params.notify(path);
	}

	private async uniquePath(path: string): Promise<string> {
		if (!(await this.params.exists(path))) {
			return path;
		}
		const dot = path.lastIndexOf('.');
		const stem = dot === -1 ? path : path.slice(0, dot);
		const extension = dot === -1 ? '' : path.slice(dot);
		let index = 1;
		for (;;) {
			const candidate = `${stem}-${String(index)}${extension}`;
			if (!(await this.params.exists(candidate))) {
				return candidate;
			}
			index += 1;
		}
	}
}
