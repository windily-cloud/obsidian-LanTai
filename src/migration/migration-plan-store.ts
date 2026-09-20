import type { MigrationPlan } from './migration-plan.ts';

export const MIGRATION_PLAN_FILE_NAME = 'lantai-migration.json';

export type LoadMigrationPlanResult =
	| InvalidMigrationPlan
	| LoadedMigrationPlan
	| MissingMigrationPlan;

export interface MigrationPlanStore {
	delete(): Promise<void>;
	load(): Promise<LoadMigrationPlanResult>;
	readonly path: string;
	save(plan: MigrationPlan): Promise<void>;
}

interface InvalidMigrationPlan {
	readonly ok: false;
	readonly reason: 'invalid';
}

interface LoadedMigrationPlan {
	readonly ok: true;
	readonly plan: MigrationPlan;
}

interface MissingMigrationPlan {
	readonly ok: true;
	readonly plan: null;
}
