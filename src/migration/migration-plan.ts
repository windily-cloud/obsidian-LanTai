import type { StorageProvider } from '../settings/sections/s3/storage-profile.ts';

/** Exposed for unit tests. */
export const MIGRATION_PLAN_VERSION = 1;

export interface MigrationItem {
	bytes: number;
	error?: string;
	localPath: string;
	refs: MigrationRef[];
	status: MigrationItemStatus;
	uploadedKey?: string;
	uploadedUrl?: string;
}

export interface MigrationPlan {
	createdAt: number;
	deleteSourceAfterUpload: boolean;
	folders: string[];
	items: MigrationItem[];
	profileId: string;
	provider: StorageProvider;
	stats: MigrationStats;
	status: MigrationPlanStatus;
	updatedAt: number;
	urlPattern: string;
	version: number;
}

export interface MigrationRef {
	error?: string;
	notePath: string;
	source: string;
	status: MigrationRefStatus;
}

interface InvalidParsedMigrationPlan {
	readonly ok: false;
	readonly reason: 'invalid';
}

type MigrationItemStatus = 'done' | 'failed' | 'pending' | 'uploaded';

type MigrationPlanStatus = 'completed' | 'paused' | 'running' | 'scanned';

type MigrationRefStatus = 'done' | 'failed' | 'pending';

interface MigrationStats {
	doneCount: number;
	failedCount: number;
	noteCount: number;
	totalBytes: number;
	totalRefs: number;
	uniqueFiles: number;
}

type ParsedMigrationPlan = InvalidParsedMigrationPlan | ValidParsedMigrationPlan;

interface ValidParsedMigrationPlan {
	readonly ok: true;
	readonly plan: MigrationPlan;
}

const PROVIDERS: readonly StorageProvider[] = [
	'alibaba',
	'lantai',
	'r2',
	's3',
	's3Compatible',
	'tencent'
];

export function migrationAllDone(plan: MigrationPlan): boolean {
	return plan.items.length > 0 && plan.items.every((item) => item.status === 'done');
}

export function parseMigrationPlan(raw: unknown): ParsedMigrationPlan {
	if (typeof raw !== 'object' || raw === null) {
		return { ok: false, reason: 'invalid' };
	}
	const record = raw as Record<string, unknown>;
	if (record['version'] !== MIGRATION_PLAN_VERSION) {
		return { ok: false, reason: 'invalid' };
	}
	const status = record['status'];
	const provider = record['provider'];
	const items = record['items'];
	const stats = record['stats'];
	const folders = record['folders'];
	if (
		!isPlanStatus(status)
		|| typeof record['profileId'] !== 'string'
		|| !isProvider(provider)
		|| typeof record['urlPattern'] !== 'string'
		|| typeof record['deleteSourceAfterUpload'] !== 'boolean'
		|| typeof record['createdAt'] !== 'number'
		|| typeof record['updatedAt'] !== 'number'
		|| !Array.isArray(folders)
		|| !folders.every((folder) => typeof folder === 'string')
		|| !isStats(stats)
		|| !Array.isArray(items)
	) {
		return { ok: false, reason: 'invalid' };
	}
	const parsedItems: MigrationItem[] = [];
	for (const item of items) {
		const parsed = parseItem(item);
		if (!parsed) {
			return { ok: false, reason: 'invalid' };
		}
		parsedItems.push(parsed);
	}
	return {
		ok: true,
		plan: {
			createdAt: record['createdAt'],
			deleteSourceAfterUpload: record['deleteSourceAfterUpload'],
			folders,
			items: parsedItems,
			profileId: record['profileId'],
			provider,
			stats,
			status,
			updatedAt: record['updatedAt'],
			urlPattern: record['urlPattern'],
			version: MIGRATION_PLAN_VERSION
		}
	};
}

export function refreshMigrationStats(plan: MigrationPlan): void {
	const notes = new Set<string>();
	let totalRefs = 0;
	let totalBytes = 0;
	let doneCount = 0;
	let failedCount = 0;
	for (const item of plan.items) {
		totalRefs += item.refs.length;
		if (item.status === 'done') {
			doneCount += 1;
		} else if (item.status === 'failed') {
			failedCount += 1;
		}
		if (item.status !== 'failed' || item.bytes > 0) {
			totalBytes += item.bytes;
		}
		for (const ref of item.refs) {
			notes.add(ref.notePath);
		}
	}
	plan.stats = {
		doneCount,
		failedCount,
		noteCount: notes.size,
		totalBytes,
		totalRefs,
		uniqueFiles: plan.items.length
	};
}

function isItemStatus(value: unknown): value is MigrationItemStatus {
	return value === 'done' || value === 'failed' || value === 'pending' || value === 'uploaded';
}

function isPlanStatus(value: unknown): value is MigrationPlanStatus {
	return value === 'completed' || value === 'paused' || value === 'running' || value === 'scanned';
}

function isProvider(value: unknown): value is StorageProvider {
	return typeof value === 'string' && (PROVIDERS as readonly string[]).includes(value);
}

function isRefStatus(value: unknown): value is MigrationRefStatus {
	return value === 'done' || value === 'failed' || value === 'pending';
}

function isStats(value: unknown): value is MigrationStats {
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	const stats = value as Record<string, unknown>;
	return ['doneCount', 'failedCount', 'noteCount', 'totalBytes', 'totalRefs', 'uniqueFiles']
		.every((key) => typeof stats[key] === 'number');
}

function parseItem(raw: unknown): MigrationItem | null {
	if (typeof raw !== 'object' || raw === null) {
		return null;
	}
	const record = raw as Record<string, unknown>;
	const status = record['status'];
	const refs = record['refs'];
	if (
		typeof record['localPath'] !== 'string'
		|| typeof record['bytes'] !== 'number'
		|| !isItemStatus(status)
		|| !Array.isArray(refs)
	) {
		return null;
	}
	const parsedRefs: MigrationRef[] = [];
	for (const ref of refs) {
		const parsed = parseRef(ref);
		if (!parsed) {
			return null;
		}
		parsedRefs.push(parsed);
	}
	const item: MigrationItem = {
		bytes: record['bytes'],
		localPath: record['localPath'],
		refs: parsedRefs,
		status
	};
	if (typeof record['error'] === 'string') {
		item.error = record['error'];
	}
	if (typeof record['uploadedKey'] === 'string') {
		item.uploadedKey = record['uploadedKey'];
	}
	if (typeof record['uploadedUrl'] === 'string') {
		item.uploadedUrl = record['uploadedUrl'];
	}
	return item;
}

function parseRef(raw: unknown): MigrationRef | null {
	if (typeof raw !== 'object' || raw === null) {
		return null;
	}
	const record = raw as Record<string, unknown>;
	const status = record['status'];
	if (
		typeof record['notePath'] !== 'string'
		|| typeof record['source'] !== 'string'
		|| !isRefStatus(status)
	) {
		return null;
	}
	const ref: MigrationRef = {
		notePath: record['notePath'],
		source: record['source'],
		status
	};
	if (typeof record['error'] === 'string') {
		ref.error = record['error'];
	}
	return ref;
}
