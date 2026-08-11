import type { App } from 'obsidian';

import { noopAsync } from 'obsidian-dev-utils/function';

import type {
	UploadHistoryEntry,
	UploadHistoryStore
} from '../../storage/upload-history.ts';

import {
	appendHistoryEntry,
	MAX_HISTORY_ENTRIES,
	removeHistoryEntry
} from '../../storage/upload-history.ts';

const HISTORY_FILE_NAME = 'lantai-upload-history.json';
const HISTORY_FILE_VERSION = 1;

interface ObsidianUploadHistoryStoreConstructorParams {
	readonly app: App;
}

interface PersistedUploadHistory {
	entries: UploadHistoryEntry[];
	version: number;
}

export class ObsidianUploadHistoryStore implements UploadHistoryStore {
	private readonly adapter: App['vault']['adapter'];
	private entries: UploadHistoryEntry[] = [];
	private readonly loadPromise: Promise<void>;
	private readonly path: string;
	private writeQueue: Promise<void> = noopAsync();

	public constructor(params: ObsidianUploadHistoryStoreConstructorParams) {
		this.adapter = params.app.vault.adapter;
		this.path = `${params.app.vault.configDir}/${HISTORY_FILE_NAME}`;
		this.loadPromise = this.load(params.app);
	}

	public append(entry: UploadHistoryEntry): Promise<void> {
		return this.enqueue(async () => {
			await this.loadPromise;
			this.entries = appendHistoryEntry(this.entries, entry);
			await this.persist();
		});
	}

	public list(profileId: string): UploadHistoryEntry[] {
		return this.entries.filter((entry) => entry.profileId === profileId);
	}

	public ready(): Promise<void> {
		return this.loadPromise;
	}

	public removeByKey(profileId: string, key: string): Promise<void> {
		return this.enqueue(async () => {
			await this.loadPromise;
			this.entries = removeHistoryEntry(this.entries, profileId, key);
			await this.persist();
		});
	}

	private enqueue(operation: () => Promise<void>): Promise<void> {
		const run = this.writeQueue.then(operation, operation);
		this.writeQueue = run.then(() => undefined, () => undefined);
		return run;
	}

	private async load(app: App): Promise<void> {
		try {
			const raw = await app.vault.adapter.read(this.path);
			const parsed = JSON.parse(raw) as PersistedUploadHistory;
			if (parsed.version === HISTORY_FILE_VERSION && Array.isArray(parsed.entries)) {
				this.entries = parsed.entries.slice(0, MAX_HISTORY_ENTRIES);
			}
		} catch {
			this.entries = [];
		}
	}

	private async persist(): Promise<void> {
		const payload: PersistedUploadHistory = {
			entries: this.entries,
			version: HISTORY_FILE_VERSION
		};
		try {
			await this.adapter.write(this.path, JSON.stringify(payload));
		} catch (error) {
			// History persistence must never block the upload flow.
			console.warn('Failed to persist LanTai upload history', error);
		}
	}
}
