import type { App } from 'obsidian';

import { noopAsync } from 'obsidian-dev-utils/function';

import type {
	LoadMigrationPlanResult,
	MigrationPlanStore
} from '../../migration/migration-plan-store.ts';
import type { MigrationPlan } from '../../migration/migration-plan.ts';

import { MIGRATION_PLAN_FILE_NAME } from '../../migration/migration-plan-store.ts';
import { parseMigrationPlan } from '../../migration/migration-plan.ts';

const JSON_INDENT = 2;

interface ObsidianMigrationPlanStoreConstructorParams {
	readonly app: App;
}

export class ObsidianMigrationPlanStore implements MigrationPlanStore {
	public readonly path: string;
	private readonly adapter: App['vault']['adapter'];
	private writeQueue: Promise<void> = noopAsync();

	public constructor(params: ObsidianMigrationPlanStoreConstructorParams) {
		this.adapter = params.app.vault.adapter;
		this.path = `${params.app.vault.configDir}/${MIGRATION_PLAN_FILE_NAME}`;
	}

	public delete(): Promise<void> {
		return this.enqueue(async () => {
			try {
				await this.adapter.remove(this.path);
			} catch {
				// Missing file is fine.
			}
		});
	}

	public async load(): Promise<LoadMigrationPlanResult> {
		await this.writeQueue;
		try {
			const raw = await this.adapter.read(this.path);
			return parseMigrationPlan(JSON.parse(raw));
		} catch {
			return { ok: true, plan: null };
		}
	}

	public save(plan: MigrationPlan): Promise<void> {
		return this.enqueue(async () => {
			await this.adapter.write(this.path, `${JSON.stringify(plan, null, JSON_INDENT)}\n`);
		});
	}

	private enqueue(operation: () => Promise<void>): Promise<void> {
		const run = this.writeQueue.then(operation, operation);
		this.writeQueue = run.then(() => undefined, () => undefined);
		return run;
	}
}
