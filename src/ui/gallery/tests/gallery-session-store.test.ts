import type { App } from 'obsidian';

import {
	afterEach,
	describe,
	expect,
	it,
	vi
} from 'vitest';

import { ObsidianGallerySessionStore } from '../../../adapters/obsidian/gallery-session.obsidian.ts';
import {
	DEFAULT_GALLERY_SESSION,
	GALLERY_SESSION_DEBOUNCE_MS,
	GALLERY_SESSION_KEY
} from '../gallery-session.ts';

interface CreatedGallerySessionStore {
	readonly store: ObsidianGallerySessionStore;
	readonly writes: unknown[];
}

function createStore(initial: unknown = null): CreatedGallerySessionStore {
	const writes: unknown[] = [];
	let stored: unknown = initial;
	const app = Object.assign(Object.create(null), {
		loadLocalStorage(key: string): unknown {
			expect(key).toBe(GALLERY_SESSION_KEY);
			return stored;
		},
		saveLocalStorage(key: string, data: unknown): void {
			expect(key).toBe(GALLERY_SESSION_KEY);
			stored = data;
			writes.push(data);
		}
	}) as App;
	return {
		store: new ObsidianGallerySessionStore({ app }),
		writes
	};
}

describe('ObsidianGallerySessionStore', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('discards an invalid blob and writes defaults', () => {
		const { store, writes } = createStore({ version: 99 });
		expect(store.read()).toEqual(DEFAULT_GALLERY_SESSION);
		expect(writes).toEqual([DEFAULT_GALLERY_SESSION]);
	});

	it('debounces width writes and flush writes the latest', () => {
		vi.useFakeTimers();
		const { store, writes } = createStore(DEFAULT_GALLERY_SESSION);
		expect(writes).toHaveLength(0);

		store.saveDebounced({ ...DEFAULT_GALLERY_SESSION, panelWidth: 400 });
		store.saveDebounced({ ...DEFAULT_GALLERY_SESSION, panelWidth: 410 });
		expect(writes).toHaveLength(0);

		vi.advanceTimersByTime(GALLERY_SESSION_DEBOUNCE_MS);
		expect(writes).toHaveLength(1);
		expect(writes[0]).toMatchObject({ panelWidth: 410 });

		store.saveDebounced({ ...DEFAULT_GALLERY_SESSION, panelWidth: 500 });
		store.flush();
		expect(writes.at(-1)).toMatchObject({ panelWidth: 500 });
	});
});
