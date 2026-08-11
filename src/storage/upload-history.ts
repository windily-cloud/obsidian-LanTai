export const MAX_HISTORY_ENTRIES = 500;

export interface UploadHistoryEntry {
	key: string;
	profileId: string;
	timestamp: number;
	url: string;
}

export interface UploadHistoryStore {
	append(entry: UploadHistoryEntry): Promise<void>;
	/** Entries for the profile, newest first. */
	list(profileId: string): UploadHistoryEntry[];
	/** Resolves once the initial persistence load has finished. */
	ready(): Promise<void>;
	removeByKey(profileId: string, key: string): Promise<void>;
}

/** Pure helpers exposed for unit tests. */
export function appendHistoryEntry(
	entries: readonly UploadHistoryEntry[],
	entry: UploadHistoryEntry,
	maxEntries: number = MAX_HISTORY_ENTRIES
): UploadHistoryEntry[] {
	const withoutDuplicate = entries.filter(
		(existing) => !(existing.profileId === entry.profileId && existing.key === entry.key)
	);
	return [entry, ...withoutDuplicate].slice(0, maxEntries);
}

export function filterHistoryEntries(
	entries: readonly UploadHistoryEntry[],
	profileId: string
): UploadHistoryEntry[] {
	return entries.filter((entry) => entry.profileId === profileId);
}

export function removeHistoryEntry(
	entries: readonly UploadHistoryEntry[],
	profileId: string,
	key: string
): UploadHistoryEntry[] {
	return entries.filter((entry) => !(entry.profileId === profileId && entry.key === key));
}
