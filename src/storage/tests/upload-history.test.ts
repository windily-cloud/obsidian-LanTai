import {
	describe,
	expect,
	it
} from 'vitest';

import type { UploadHistoryEntry } from '../upload-history.ts';

import {
	appendHistoryEntry,
	filterHistoryEntries,
	MAX_HISTORY_ENTRIES,
	removeHistoryEntry
} from '../upload-history.ts';

interface EntryPartial extends Partial<UploadHistoryEntry> {
	key: string;
}

function entry(partial: EntryPartial): UploadHistoryEntry {
	return {
		profileId: 'p1',
		timestamp: 1000,
		url: `https://cdn.example.com/${partial.key}`,
		...partial
	};
}

describe('appendHistoryEntry', () => {
	it('prepends the new entry', () => {
		const next = appendHistoryEntry(
			[entry({ key: 'a.png', timestamp: 1000 })],
			entry({ key: 'b.png', timestamp: 2000 })
		);
		expect(next.map((item) => item.key)).toEqual(['b.png', 'a.png']);
	});

	it('replaces an existing entry with the same key and profile', () => {
		const next = appendHistoryEntry(
			[entry({ key: 'a.png', timestamp: 1000, url: 'https://cdn.example.com/old' })],
			entry({ key: 'a.png', timestamp: 3000, url: 'https://cdn.example.com/new' })
		);
		expect(next).toHaveLength(1);
		expect(next[0]?.timestamp).toBe(3000);
		expect(next[0]?.url).toBe('https://cdn.example.com/new');
	});

	it('keeps entries of other profiles untouched', () => {
		const next = appendHistoryEntry(
			[entry({ key: 'a.png', profileId: 'other' })],
			entry({ key: 'b.png' })
		);
		expect(next).toHaveLength(2);
	});

	it('truncates to MAX_HISTORY_ENTRIES', () => {
		const existing = Array.from(
			{ length: MAX_HISTORY_ENTRIES },
			(_, index) => entry({ key: `old-${String(index)}.png`, timestamp: index })
		);
		const next = appendHistoryEntry(existing, entry({ key: 'new.png', timestamp: 99999 }));
		expect(next).toHaveLength(MAX_HISTORY_ENTRIES);
		expect(next[0]?.key).toBe('new.png');
		expect(next.some((item) => item.key === 'old-499.png')).toBe(false);
	});
});

describe('filterHistoryEntries', () => {
	it('returns only entries of the requested profile', () => {
		const entries = [
			entry({ key: 'a.png', profileId: 'p1' }),
			entry({ key: 'b.png', profileId: 'p2' }),
			entry({ key: 'c.png', profileId: 'p1' })
		];
		expect(filterHistoryEntries(entries, 'p1').map((item) => item.key)).toEqual(['a.png', 'c.png']);
	});
});

describe('removeHistoryEntry', () => {
	it('removes the matching profile/key pair only', () => {
		const entries = [
			entry({ key: 'a.png', profileId: 'p1' }),
			entry({ key: 'a.png', profileId: 'p2' }),
			entry({ key: 'b.png', profileId: 'p1' })
		];
		const next = removeHistoryEntry(entries, 'p1', 'a.png');
		expect(next.map((item) => item.key)).toEqual(['a.png', 'b.png']);
		expect(next[0]?.profileId).toBe('p2');
	});
});
