import { noopAsync } from 'obsidian-dev-utils/function';

export interface BrowserDownload {
	save(fileName: string, bytes: Uint8Array): Promise<void>;
}

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
	bmp: 'image/bmp',
	gif: 'image/gif',
	jpeg: 'image/jpeg',
	jpg: 'image/jpeg',
	png: 'image/png',
	svg: 'image/svg+xml',
	webp: 'image/webp'
};

export class ObsidianBrowserDownload implements BrowserDownload {
	public save(fileName: string, bytes: Uint8Array): Promise<void> {
		const copy = new Uint8Array(bytes.byteLength);
		copy.set(bytes);
		const blob = new Blob([copy], { type: mimeTypeForFileName(fileName) });
		// Obsidian runs in Chromium; Node's URL feature gate does not apply here.
		// eslint-disable-next-line n/no-unsupported-features/node-builtins -- browser download API
		const url = URL.createObjectURL(blob);
		try {
			const anchor = createEl('a');
			anchor.href = url;
			anchor.download = fileName;
			anchor.click();
		} finally {
			// eslint-disable-next-line n/no-unsupported-features/node-builtins -- browser download API
			URL.revokeObjectURL(url);
		}
		return noopAsync();
	}
}

function mimeTypeForFileName(fileName: string): string {
	const extension = fileName.includes('.')
		? fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase()
		: '';
	return MIME_BY_EXTENSION[extension] ?? 'application/octet-stream';
}
