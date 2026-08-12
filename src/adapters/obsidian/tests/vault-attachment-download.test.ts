import { noopAsync } from 'obsidian-dev-utils/function';
import {
	describe,
	expect,
	it
} from 'vitest';

import { VaultAttachmentDownload } from '../vault-attachment-download.obsidian.ts';

interface WrittenBinary {
	readonly bytes: Uint8Array;
	readonly path: string;
}

describe('VaultAttachmentDownload', () => {
	it('writes bytes to the resolved vault path and notifies', async () => {
		const written: WrittenBinary[] = [];
		const notices: string[] = [];
		const download = new VaultAttachmentDownload({
			exists: async (): Promise<boolean> => {
				await noopAsync();
				return false;
			},
			notify: (path: string): void => {
				notices.push(path);
			},
			resolveDestination: (fileName: string): string => `attachments/${fileName}`,
			writeBinary: async (path: string, bytes: Uint8Array): Promise<void> => {
				written.push({ bytes, path });
				await noopAsync();
			}
		});

		await download.save('photo.png', new Uint8Array([1, 2, 3]));

		expect(written).toEqual([{ bytes: new Uint8Array([1, 2, 3]), path: 'attachments/photo.png' }]);
		expect(notices).toEqual(['attachments/photo.png']);
	});

	it('appends a numeric suffix when the destination already exists', async () => {
		const written: string[] = [];
		const download = new VaultAttachmentDownload({
			exists: async (path: string): Promise<boolean> => {
				await noopAsync();
				return path === 'attachments/photo.png';
			},
			notify: (): void => undefined,
			resolveDestination: (fileName: string): string => `attachments/${fileName}`,
			writeBinary: async (path: string): Promise<void> => {
				written.push(path);
				await noopAsync();
			}
		});

		await download.save('photo.png', new Uint8Array([9]));

		expect(written).toEqual(['attachments/photo-1.png']);
	});
});
