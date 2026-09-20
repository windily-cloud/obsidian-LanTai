import type { App } from 'obsidian';

import { fromPartial } from '@total-typescript/shoehorn';
import {
	describe,
	expect,
	it,
	vi
} from 'vitest';

import type { MigrationPlan } from '../../../migration/migration-plan.ts';

import { MIGRATION_PLAN_VERSION } from '../../../migration/migration-plan.ts';
import { ObsidianMigrationPlanStore } from '../migration-plan-store.obsidian.ts';

const CONFIG_DIR = 'vault-config';
const PLAN_PATH = `${CONFIG_DIR}/lantai-migration.json`;

interface CreateStoreResult {
	readonly adapter: FakeAdapter;
	readonly store: ObsidianMigrationPlanStore;
}

interface FakeAdapter {
	read: ReturnType<typeof vi.fn>;
	remove: ReturnType<typeof vi.fn>;
	write: ReturnType<typeof vi.fn>;
}

function createStore(): CreateStoreResult {
	const adapter: FakeAdapter = {
		read: vi.fn(),
		remove: vi.fn().mockResolvedValue(undefined),
		write: vi.fn().mockResolvedValue(undefined)
	};
	const app = fromPartial<App>({
		vault: {
			adapter,
			configDir: CONFIG_DIR
		}
	});
	return { adapter, store: new ObsidianMigrationPlanStore({ app }) };
}

function samplePlan(): MigrationPlan {
	return {
		createdAt: 1,
		deleteSourceAfterUpload: false,
		folders: ['Journal'],
		items: [],
		profileId: 'p1',
		provider: 's3',
		stats: {
			doneCount: 0,
			failedCount: 0,
			noteCount: 0,
			totalBytes: 0,
			totalRefs: 0,
			uniqueFiles: 0
		},
		status: 'scanned',
		updatedAt: 1,
		// eslint-disable-next-line no-template-curly-in-string -- pattern stored as-is
		urlPattern: 'https://cdn.example.com/images/${originalName}.${ext}',
		version: MIGRATION_PLAN_VERSION
	};
}

describe('ObsidianMigrationPlanStore', () => {
	it('writes the plan under configDir and round-trips it', async () => {
		const { adapter, store } = createStore();
		expect(store.path).toBe(PLAN_PATH);
		const plan = samplePlan();
		await store.save(plan);
		expect(adapter.write).toHaveBeenCalledWith(
			PLAN_PATH,
			`${JSON.stringify(plan, null, 2)}\n`
		);
		adapter.read.mockResolvedValue(JSON.stringify(plan));
		await expect(store.load()).resolves.toEqual({ ok: true, plan });
	});

	it('treats a missing file as no plan', async () => {
		const { adapter, store } = createStore();
		adapter.read.mockRejectedValue(new Error('missing'));
		await expect(store.load()).resolves.toEqual({ ok: true, plan: null });
	});

	it('rejects an unknown version so the wizard must discard', async () => {
		const { adapter, store } = createStore();
		adapter.read.mockResolvedValue(JSON.stringify({ ...samplePlan(), version: 99 }));
		await expect(store.load()).resolves.toEqual({ ok: false, reason: 'invalid' });
	});

	it('serializes consecutive saves through the write queue', async () => {
		const { adapter, store } = createStore();
		const first = samplePlan();
		const second: MigrationPlan = { ...samplePlan(), status: 'running' };
		await Promise.all([store.save(first), store.save(second)]);
		expect(adapter.write.mock.calls).toHaveLength(2);
		expect(String(adapter.write.mock.calls[1]?.[1])).toContain('"status": "running"');
	});

	it('deletes the plan file', async () => {
		const { adapter, store } = createStore();
		await store.delete();
		expect(adapter.remove).toHaveBeenCalledWith(PLAN_PATH);
	});
});
