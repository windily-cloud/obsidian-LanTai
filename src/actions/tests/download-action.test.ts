import {
	describe,
	expect,
	it
} from 'vitest';

import { FakeHttpFetch } from '../../adapters/obsidian/tests/fake-http-fetch.ts';
import { FakeSaveDialog } from '../../adapters/obsidian/tests/fake-save-dialog.ts';
import { FakeVaultBinary } from '../../adapters/obsidian/tests/fake-vault-binary.ts';
import { DownloadAction } from '../download-action.ts';

describe('DownloadAction', () => {
	it('saves bytes to picked os path without changing note', async () => {
		const dialog = new FakeSaveDialog({ picked: '/tmp/a.png' });
		const http = new FakeHttpFetch({
			responses: { 'https://cdn.example.com/a.png': new Uint8Array([4, 5]) }
		});
		const action = new DownloadAction();
		const result = await action.execute({
			defaultFileName: 'a.png',
			http,
			remoteUrl: 'https://cdn.example.com/a.png',
			saveDialog: dialog,
			vault: new FakeVaultBinary()
		});
		expect(result.ok).toBe(true);
		expect(dialog.written.get('/tmp/a.png')).toEqual(new Uint8Array([4, 5]));
	});

	it('cancels without writing when save dialog returns null', async () => {
		const dialog = new FakeSaveDialog({ picked: null });
		const http = new FakeHttpFetch({
			responses: { 'https://cdn.example.com/a.png': new Uint8Array([4, 5]) }
		});
		const action = new DownloadAction();
		const result = await action.execute({
			defaultFileName: 'a.png',
			http,
			remoteUrl: 'https://cdn.example.com/a.png',
			saveDialog: dialog,
			vault: new FakeVaultBinary()
		});
		expect(result).toEqual({ cancelled: true, ok: true });
		expect(dialog.written.size).toBe(0);
	});

	it('reads local vault bytes when localPath is provided', async () => {
		const dialog = new FakeSaveDialog({ picked: '/tmp/photo.png' });
		const vault = new FakeVaultBinary({ 'Journal/photo.png': new Uint8Array([7, 8]) });
		const action = new DownloadAction();
		const result = await action.execute({
			defaultFileName: 'photo.png',
			http: new FakeHttpFetch(),
			localPath: 'Journal/photo.png',
			saveDialog: dialog,
			vault
		});
		expect(result.ok).toBe(true);
		expect(dialog.written.get('/tmp/photo.png')).toEqual(new Uint8Array([7, 8]));
	});
});
