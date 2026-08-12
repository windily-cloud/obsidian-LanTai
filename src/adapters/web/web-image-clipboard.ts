import { t } from '../../i18n/index.ts';

export interface ClipboardImageItem {
	readonly bytes: Uint8Array;
	readonly type: string;
}

interface WebImageClipboardConstructorOptions {
	writeItems?(this: void, items: readonly ClipboardImageItem[]): Promise<void>;
}

/* eslint-disable no-magic-numbers -- image file signatures */
const GIF_SIGNATURE = [0x47, 0x49, 0x46] as const;
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff] as const;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47] as const;
const WEBP_RIFF_OFFSET = 8;
const WEBP_SIGNATURE = [0x57, 0x45, 0x42, 0x50] as const;
/* eslint-enable no-magic-numbers -- end image file signatures */

export class WebImageClipboard {
	private readonly writeItems: (items: readonly ClipboardImageItem[]) => Promise<void>;

	public constructor(options: WebImageClipboardConstructorOptions = {}) {
		this.writeItems = options.writeItems ?? defaultWriteItems;
	}

	public async copy(bytes: Uint8Array): Promise<void> {
		await this.writeItems([{ bytes, type: sniffImageMime(bytes) }]);
	}
}

export function sniffImageMime(bytes: Uint8Array): string {
	if (startsWith(bytes, JPEG_SIGNATURE)) {
		return 'image/jpeg';
	}
	if (startsWith(bytes, PNG_SIGNATURE)) {
		return 'image/png';
	}
	if (startsWith(bytes, GIF_SIGNATURE)) {
		return 'image/gif';
	}
	if (startsWithAt(bytes, WEBP_RIFF_OFFSET, WEBP_SIGNATURE)) {
		return 'image/webp';
	}
	return 'image/png';
}

function copyBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
	return new Uint8Array(bytes);
}

async function defaultWriteItems(items: readonly ClipboardImageItem[]): Promise<void> {
	// Obsidian runs in Chromium; Node's navigator feature gate does not apply here.
	// eslint-disable-next-line n/no-unsupported-features/node-builtins -- web clipboard API
	const clipboard = window.navigator.clipboard;
	if (typeof ClipboardItem === 'undefined' || typeof clipboard.write !== 'function') {
		throw new Error(t('errors.webClipboardUnavailable'));
	}
	await clipboard.write(
		items.map((item) =>
			new ClipboardItem({
				[item.type]: new Blob([copyBytes(item.bytes)], { type: item.type })
			})
		)
	);
}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
	return startsWithAt(bytes, 0, signature);
}

function startsWithAt(bytes: Uint8Array, offset: number, signature: readonly number[]): boolean {
	if (bytes.length < offset + signature.length) {
		return false;
	}
	return signature.every((value, index) => bytes[offset + index] === value);
}
