import {
	describe,
	expect,
	it
} from 'vitest';

import { FakeBrowserDownload } from '../../adapters/obsidian/tests/fake-browser-download.ts';
import { FakeHttpFetch } from '../../adapters/obsidian/tests/fake-http-fetch.ts';
import { FakeVaultBinary } from '../../adapters/obsidian/tests/fake-vault-binary.ts';
import { DownloadAction } from '../download-action.ts';

describe('DownloadAction', () => {
	it('saves bytes via browser download without changing note', async () => {
		const download = new FakeBrowserDownload();
		const http = new FakeHttpFetch({
			responses: { 'https://cdn.example.com/a.png': new Uint8Array([4, 5]) }
		});
		const action = new DownloadAction();
		const result = await action.execute({
			defaultFileName: 'a.png',
			download,
			http,
			remoteUrl: 'https://cdn.example.com/a.png',
			vault: new FakeVaultBinary()
		});
		expect(result.ok).toBe(true);
		expect(download.saved).toEqual([{ bytes: new Uint8Array([4, 5]), fileName: 'a.png' }]);
	});

	it('reads local vault bytes when localPath is provided', async () => {
		const download = new FakeBrowserDownload();
		const vault = new FakeVaultBinary({ 'Journal/photo.png': new Uint8Array([7, 8]) });
		const action = new DownloadAction();
		const result = await action.execute({
			defaultFileName: 'photo.png',
			download,
			http: new FakeHttpFetch(),
			localPath: 'Journal/photo.png',
			vault
		});
		expect(result.ok).toBe(true);
		expect(download.saved).toEqual([{ bytes: new Uint8Array([7, 8]), fileName: 'photo.png' }]);
	});
});
