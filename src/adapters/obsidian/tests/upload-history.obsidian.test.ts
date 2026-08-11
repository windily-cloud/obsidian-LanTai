import type { App } from 'obsidian';

import { fromPartial } from '@total-typescript/shoehorn';
import {
	describe,
	expect,
	it,
	vi
} from 'vitest';

import type { UploadHistoryEntry } from '../../../storage/upload-history.ts';

import { ObsidianUploadHistoryStore } from '../upload-history.obsidian.ts';

const HISTORY_PATH = '.obsidian/lantai-upload-history.json';

interface CreateStoreOptions {
	readonly readRejects?: boolean;
	readonly readResult?: Promise<string> | string;
	readonly writeRejects?: boolean;
}

interface CreateStoreResult {
	readonly adapter: FakeAdapter;
	readonly store: ObsidianUploadHistoryStore;
}

interface FakeAdapter {
	read: ReturnType<typeof vi.fn>;
	write: ReturnType<typeof vi.fn>;
}

interface PersistedHistoryPayload {
	entries: UploadHistoryEntry[];
}

function createStore(options: CreateStoreOptions = {}): CreateStoreResult {
	const adapter: FakeAdapter = {
		read: vi.fn(),
		write: vi.fn()
	};
	if (options.readResult !== undefined) {
		if (typeof options.readResult === 'string') {
			adapter.read.mockResolvedValue(options.readResult);
		} else {
			adapter.read.mockReturnValue(options.readResult);
		}
	} else if (options.readRejects) {
		adapter.read.mockRejectedValue(new Error('read failed'));
	} else {
		adapter.read.mockResolvedValue('');
	}
	if (options.writeRejects) {
		adapter.write.mockRejectedValue(new Error('write failed'));
	} else {
		adapter.write.mockResolvedValue(undefined);
	}
	const app = fromPartial<App>({
		vault: {
			adapter,
			configDir: '.obsidian'
		}
	});
	return { adapter, store: new ObsidianUploadHistoryStore({ app }) };
}

function flushMicrotasks(): Promise<void> {
	return new Promise<void>((resolve) => {
		window.setTimeout(() => {
			resolve();
		}, 0);
	});
}

const SAMPLE_ENTRY: UploadHistoryEntry = {
	key: 'gallery/2026/08/a.png',
	profileId: 'p1',
	timestamp: 1723000000000,
	url: 'https://cdn.example.com/gallery/2026/08/a.png'
};

describe('ObsidianUploadHistoryStore', () => {
	it('loads persisted entries from the history file', async () => {
		const { store } = createStore({
			readResult: JSON.stringify({
				entries: [SAMPLE_ENTRY],
				version: 1
			})
		});
		await flushMicrotasks();
		expect(store.list('p1')).toEqual([SAMPLE_ENTRY]);
	});

	it('treats a missing or unreadable file as empty history', async () => {
		const { store } = createStore({ readRejects: true });
		await flushMicrotasks();
		expect(store.list('p1')).toEqual([]);
	});

	it('treats corrupted JSON as empty history', async () => {
		const { store } = createStore({ readResult: '{not json' });
		await flushMicrotasks();
		expect(store.list('p1')).toEqual([]);
	});

	it('ignores files with an unknown version', async () => {
		const { store } = createStore({
			readResult: JSON.stringify({ entries: [SAMPLE_ENTRY], version: 99 })
		});
		await flushMicrotasks();
		expect(store.list('p1')).toEqual([]);
	});

	it('persists appended entries to the history file', async () => {
		const { adapter, store } = createStore();
		await store.append(SAMPLE_ENTRY);
		expect(adapter.write).toHaveBeenCalledWith(
			HISTORY_PATH,
			JSON.stringify({ entries: [SAMPLE_ENTRY], version: 1 })
		);
	});

	it('persists removals to the history file', async () => {
		const { adapter, store } = createStore({
			readResult: JSON.stringify({ entries: [SAMPLE_ENTRY], version: 1 })
		});
		await store.removeByKey('p1', SAMPLE_ENTRY.key);
		expect(adapter.write).toHaveBeenCalledWith(
			HISTORY_PATH,
			JSON.stringify({ entries: [], version: 1 })
		);
	});

	it('does not throw when persisting fails', async () => {
		const { store } = createStore({ writeRejects: true });
		await expect(store.append(SAMPLE_ENTRY)).resolves.toBeUndefined();
		expect(store.list('p1')).toEqual([SAMPLE_ENTRY]);
	});

	it('ready waits until the history file has been loaded', async () => {
		let resolveRead: ((value: string) => void) | undefined;
		const readResult = new Promise<string>((resolve) => {
			resolveRead = resolve;
		});
		const { store } = createStore({ readResult });
		const ready = store.ready();
		let settled = false;
		ready.then(() => {
			settled = true;
		}, () => undefined);
		await flushMicrotasks();
		expect(settled).toBe(false);
		expect(store.list('p1')).toEqual([]);
		resolveRead?.(JSON.stringify({ entries: [SAMPLE_ENTRY], version: 1 }));
		await ready;
		expect(store.list('p1')).toEqual([SAMPLE_ENTRY]);
	});

	it('serializes concurrent appends so both entries persist', async () => {
		const { adapter, store } = createStore();
		const second: UploadHistoryEntry = {
			key: 'gallery/2026/08/b.png',
			profileId: 'p1',
			timestamp: 1723000000001,
			url: 'https://cdn.example.com/gallery/2026/08/b.png'
		};
		await Promise.all([store.append(SAMPLE_ENTRY), store.append(second)]);
		const lastWrite = adapter.write.mock.calls.at(-1)?.[1] as string;
		const parsed = JSON.parse(lastWrite) as PersistedHistoryPayload;
		expect(parsed.entries.map((entry) => entry.key).sort()).toEqual([
			'gallery/2026/08/a.png',
			'gallery/2026/08/b.png'
		]);
	});
});
