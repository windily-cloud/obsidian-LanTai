import {
	describe,
	expect,
	it,
	vi
} from 'vitest';

import { SystemFileClipboard } from '../system-file-clipboard.ts';

describe('SystemFileClipboard', () => {
	it('copies a file through the Windows shell without interpolating its path', async () => {
		const run = vi.fn<(...args: [string, readonly string[]]) => Promise<void>>()
			.mockResolvedValue(undefined);
		const clipboard = new SystemFileClipboard({
			platform: 'win32',
			run
		});

		await clipboard.copy('/vault/image with \' quote.png');

		expect(run).toHaveBeenCalledOnce();
		expect(run).toHaveBeenCalledWith('powershell.exe', [
			'-STA',
			'-NoProfile',
			'-NonInteractive',
			'-Command',
			expect.stringContaining('[Windows.Forms.Clipboard]::SetFileDropList($files)'),
			'/vault/image with \' quote.png'
		]);
	});

	it('reveals and copies a file through Finder on macOS', async () => {
		const run = vi.fn<(...args: [string, readonly string[]]) => Promise<void>>()
			.mockResolvedValue(undefined);
		const clipboard = new SystemFileClipboard({
			platform: 'darwin',
			run
		});

		await clipboard.copy('/vault/image.png');

		expect(run).toHaveBeenNthCalledWith(1, 'open', ['-R', '/vault/image.png']);
		expect(run).toHaveBeenNthCalledWith(2, 'osascript', [
			'-e',
			expect.stringContaining('keystroke "c" using command down')
		]);
		expect(run.mock.calls[1]?.[1][1]).toContain('tell application id "md.obsidian" to activate');
	});

	it('rejects unsupported platforms', async () => {
		const clipboard = new SystemFileClipboard({
			platform: 'linux',
			run: vi.fn()
		});

		await expect(clipboard.copy('/vault/image.png')).rejects.toThrow(
			'Copy File is supported only on macOS and Windows.'
		);
	});
});
