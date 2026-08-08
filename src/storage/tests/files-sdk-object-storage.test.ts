import type { StoredFile } from 'files-sdk';

import { noopAsync } from 'obsidian-dev-utils/function';
import {
	describe,
	expect,
	it,
	vi
} from 'vitest';

import type { FilesClient } from '../files-sdk-object-storage.ts';

import { FilesSdkObjectStorage } from '../files-sdk-object-storage.ts';

describe('FilesSdkObjectStorage', () => {
	it('maps paginated files without exposing SDK types', async () => {
		const list = vi.fn<FilesClient['list']>().mockResolvedValue({
			cursor: 'next-page',
			items: [storedFile('images/cat.png', 42, 123)]
		});
		const storage = new FilesSdkObjectStorage({ files: filesClient({ list }) });

		await expect(storage.list({ cursor: 'current-page', limit: 24 })).resolves.toEqual({
			cursor: 'next-page',
			items: [{ key: 'images/cat.png', lastModified: 123, size: 42 }]
		});
		expect(list).toHaveBeenCalledWith({ cursor: 'current-page', limit: 24 });
	});

	it('uses case-insensitive substring search', async () => {
		const search = vi.fn<FilesClient['search']>().mockReturnValue(
			storedFiles(storedFile('images/Cat.png', 42))
		);
		const storage = new FilesSdkObjectStorage({ files: filesClient({ search }) });

		const matches = [];
		for await (const file of storage.search('cat')) {
			matches.push(file);
		}

		expect(matches).toEqual([{ key: 'images/Cat.png', size: 42 }]);
		expect(search).toHaveBeenCalledWith('cat', {
			caseInsensitive: true,
			match: 'substring'
		});
	});

	it('deletes an object by key', async () => {
		const deleteFile = vi.fn<FilesClient['delete']>().mockResolvedValue(undefined);
		const storage = new FilesSdkObjectStorage({ files: filesClient({ delete: deleteFile }) });

		await storage.delete('images/cat.png');

		expect(deleteFile).toHaveBeenCalledWith('images/cat.png');
	});
});

function filesClient(overrides: Partial<FilesClient>): FilesClient {
	return {
		delete: vi.fn<FilesClient['delete']>().mockResolvedValue(undefined),
		exists: vi.fn<FilesClient['exists']>().mockResolvedValue(false),
		list: vi.fn<FilesClient['list']>().mockResolvedValue({ items: [] }),
		search: vi.fn<FilesClient['search']>().mockReturnValue(
			storedFiles()
		),
		upload: vi.fn<FilesClient['upload']>().mockResolvedValue(undefined),
		url: vi.fn<FilesClient['url']>().mockResolvedValue(''),
		...overrides
	};
}

function storedFile(key: string, size: number, lastModified?: number): StoredFile {
	return {
		arrayBuffer: vi.fn(),
		blob: vi.fn(),
		key,
		...(lastModified === undefined ? {} : { lastModified }),
		name: key.split('/').at(-1) ?? key,
		size,
		stream: vi.fn(),
		text: vi.fn(),
		type: 'application/octet-stream'
	};
}

async function* storedFiles(...files: StoredFile[]): AsyncGenerator<StoredFile, void> {
	await noopAsync();
	yield* files;
}
