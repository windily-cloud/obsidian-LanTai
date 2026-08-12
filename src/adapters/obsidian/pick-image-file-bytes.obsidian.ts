/**
 * Opens a hidden file input and resolves the first selected image as bytes.
 * Shared by mobile image replace. Cancel / focus-without-file resolve null (never hang).
 *
 * The input is appended (off-screen, not `display:none`) so Android WebView delivers
 * `change` after the system picker. Window `focus` is delayed so returning from the
 * picker does not race ahead of `change`.
 */
const CANCEL_AFTER_FOCUS_MS = 500;

export interface PickedImageFile {
	readonly bytes: Uint8Array;
	readonly name: string;
}

export function pickImageFileBytes(
	doc: Document = document,
	host: Pick<Window, 'addEventListener' | 'removeEventListener'> = window
): Promise<null | PickedImageFile> {
	return new Promise((resolve) => {
		const input = doc.win.createEl('input');
		input.type = 'file';
		input.accept = 'image/*';
		input.setCssProps({
			height: '1px',
			left: '-9999px',
			opacity: '0',
			position: 'fixed',
			width: '1px'
		});
		doc.body.appendChild(input);
		let settled = false;
		let picked = false;

		function settle(value: null | PickedImageFile): void {
			if (settled) {
				return;
			}
			settled = true;
			host.removeEventListener('focus', onFocus);
			input.remove();
			resolve(value);
		}

		function onFocus(): void {
			window.setTimeout(() => {
				if (picked || (input.files?.length ?? 0) > 0) {
					return;
				}
				settle(null);
			}, CANCEL_AFTER_FOCUS_MS);
		}

		input.addEventListener('change', () => {
			picked = true;
			const file = input.files?.[0];
			if (!file) {
				settle(null);
				return;
			}
			readPickedBytes(file)
				.then((bytes) => {
					if (bytes.byteLength === 0) {
						settle(null);
						return;
					}
					settle({
						bytes,
						name: file.name.trim() || 'image.png'
					});
				})
				.catch(() => {
					settle(null);
				});
		});
		input.addEventListener('cancel', () => {
			settle(null);
		});
		host.addEventListener('focus', onFocus);
		input.click();
	});
}

async function readPickedBytes(file: File): Promise<Uint8Array> {
	try {
		const fromArrayBuffer = new Uint8Array(await file.arrayBuffer());
		if (fromArrayBuffer.byteLength > 0) {
			return fromArrayBuffer;
		}
	} catch {
		// Android WebView may reject arrayBuffer(); FileReader is the fallback.
	}
	return readWithFileReader(file);
}

function readWithFileReader(file: Blob): Promise<Uint8Array> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = (): void => {
			const result = reader.result;
			if (!(result instanceof ArrayBuffer)) {
				resolve(new Uint8Array());
				return;
			}
			resolve(new Uint8Array(result));
		};
		reader.onerror = (): void => {
			reject(reader.error ?? new Error('Failed to read picked image'));
		};
		reader.readAsArrayBuffer(file);
	});
}
