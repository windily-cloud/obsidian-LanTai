import {
	afterEach,
	describe,
	expect,
	it,
	vi
} from 'vitest';

import { pickImageFileBytes } from '../pick-image-file-bytes.obsidian.ts';

const PNG_BYTES = new Uint8Array([9, 8, 7]);

interface FakePicker {
	emitFocus(): void;
	host: Pick<Window, 'addEventListener' | 'removeEventListener'>;
	input: HTMLInputElement;
}

describe('pickImageFileBytes', () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
		for (const node of [...document.body.querySelectorAll('input[type="file"]')]) {
			node.remove();
		}
	});

	it('resolves null when the picker is cancelled', async () => {
		const { host, input } = fakePicker();
		const pending = pickImageFileBytes(document, host);
		input.dispatchEvent(new Event('cancel'));
		await expect(pending).resolves.toBeNull();
	});

	it('resolves null on window focus if no file was chosen after the cancel delay', async () => {
		vi.useFakeTimers();
		const { emitFocus, host } = fakePicker();
		const pending = pickImageFileBytes(document, host);
		emitFocus();
		await vi.advanceTimersByTimeAsync(600);
		await expect(pending).resolves.toBeNull();
		vi.useRealTimers();
	});

	it('settles only once when cancel and focus both fire', async () => {
		const { emitFocus, host, input } = fakePicker();
		const pending = pickImageFileBytes(document, host);
		input.dispatchEvent(new Event('cancel'));
		emitFocus();
		await expect(pending).resolves.toBeNull();
	});

	it('resolves file bytes when focus fires before the change event', async () => {
		vi.useFakeTimers();
		const { emitFocus, host, input } = fakePicker();
		const pending = pickImageFileBytes(document, host);
		emitFocus();
		await vi.advanceTimersByTimeAsync(0);
		assignFile(input, pngFile());
		input.dispatchEvent(new Event('change'));
		await expect(pending).resolves.toEqual({
			bytes: PNG_BYTES,
			name: 'pic.png'
		});
		vi.useRealTimers();
	});

	it('appends the file input to the document and removes it after settle', async () => {
		const { host, input } = fakePicker();
		const pending = pickImageFileBytes(document, host);
		expect(document.body.contains(input)).toBe(true);
		input.dispatchEvent(new Event('cancel'));
		await pending;
		expect(document.body.contains(input)).toBe(false);
	});

	it('resolves null when the picked file has no bytes', async () => {
		const { host, input } = fakePicker();
		const pending = pickImageFileBytes(document, host);
		assignFile(input, new File([], 'empty.png', { type: 'image/png' }));
		input.dispatchEvent(new Event('change'));
		await expect(pending).resolves.toBeNull();
	});
});

function assignFile(input: HTMLInputElement, file: File): void {
	Object.defineProperty(input, 'files', {
		configurable: true,
		value: [file]
	});
}

function fakePicker(): FakePicker {
	const input = createEl('input');
	const win = document.win;
	if (typeof win.createEl !== 'function') {
		win.createEl = createEl;
	}
	const originalCreateEl = win.createEl.bind(win);
	vi.spyOn(win, 'createEl').mockImplementation((tag, o, callback) => {
		if (tag === 'input') {
			input.click = (): void => undefined;
			return input;
		}
		return originalCreateEl(tag, o, callback);
	});
	const listeners = new Map<string, EventListener>();
	return {
		emitFocus: (): void => {
			listeners.get('focus')?.(new Event('focus'));
		},
		host: {
			addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
				if (typeof listener === 'function') {
					listeners.set(type, listener);
				}
			},
			removeEventListener(type: string): void {
				listeners.delete(type);
			}
		},
		input
	};
}

function pngFile(): File {
	return new File([PNG_BYTES], 'pic.png', { type: 'image/png' });
}
