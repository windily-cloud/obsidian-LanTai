import {
	describe,
	expect,
	it
} from 'vitest';

import type { MigrationPlan } from '../migration-plan.ts';

import {
	MIGRATION_PLAN_VERSION,
	parseMigrationPlan,
	refreshMigrationStats
} from '../migration-plan.ts';

function samplePlan(partial?: Partial<MigrationPlan>): MigrationPlan {
	return {
		createdAt: 1,
		deleteSourceAfterUpload: false,
		folders: ['Journal'],
		items: [
			{
				bytes: 3,
				localPath: 'Journal/photo.png',
				refs: [{ notePath: 'Journal/a.md', source: '![[photo.png]]', status: 'pending' }],
				status: 'pending'
			}
		],
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
		version: MIGRATION_PLAN_VERSION,
		...partial
	};
}

describe('parseMigrationPlan', () => {
	it('round-trips a valid plan', () => {
		const plan = samplePlan();
		refreshMigrationStats(plan);
		const parsed = parseMigrationPlan(JSON.parse(JSON.stringify(plan)));
		expect(parsed).toEqual({ ok: true, plan });
	});

	it('rejects the wrong version', () => {
		expect(parseMigrationPlan({ ...samplePlan(), version: 2 })).toEqual({
			ok: false,
			reason: 'invalid'
		});
	});
});

describe('refreshMigrationStats', () => {
	it('counts unique files, refs, notes, and bytes', () => {
		const plan = samplePlan({
			items: [
				{
					bytes: 10,
					localPath: 'a.png',
					refs: [
						{ notePath: 'n1.md', source: '![](a.png)', status: 'done' },
						{ notePath: 'n2.md', source: '![](a.png)', status: 'pending' }
					],
					status: 'pending'
				},
				{
					bytes: 0,
					error: 'missing',
					localPath: 'unresolved:n1.md:![](missing.png)',
					refs: [{ error: 'missing', notePath: 'n1.md', source: '![](missing.png)', status: 'failed' }],
					status: 'failed'
				}
			]
		});
		refreshMigrationStats(plan);
		expect(plan.stats).toEqual({
			doneCount: 0,
			failedCount: 1,
			noteCount: 2,
			totalBytes: 10,
			totalRefs: 3,
			uniqueFiles: 2
		});
	});
});
