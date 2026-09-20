import type { ImageRef } from '../link/image-ref.ts';
import type { StorageProfile } from '../settings/sections/s3/storage-profile.ts';
import type {
	MigrationItem,
	MigrationPlan,
	MigrationRef
} from './migration-plan.ts';

import { classifyRefs } from '../actions/image-action-facade.ts';
import { t } from '../i18n/index.ts';
import { refreshMigrationStats } from './migration-plan.ts';
import { buildMigrationUrlPattern } from './migration-url-pattern.ts';

export interface MigrationScanVault {
	fileSize(path: string): null | number;
	folderExists(path: string): boolean;
	listMarkdownFilesInFolders(folders: readonly string[]): readonly string[];
	readNote(path: string): Promise<string> | string;
	resolveLocalPath(target: string, noteFilePath: string): null | string;
}

export interface ScanMigrationInput {
	readonly deleteSourceAfterUpload: boolean;
	readonly folders: readonly string[];
	parse(content: string): readonly ImageRef[];
	readonly profile: StorageProfile;
	readonly vault: MigrationScanVault;
}

interface ScanGroup {
	bytes: number;
	found: boolean;
	refs: MigrationRef[];
}

export async function scanMigrationPlan(input: ScanMigrationInput): Promise<MigrationPlan> {
	const grouped = new Map<string, ScanGroup>();
	for (const notePath of input.vault.listMarkdownFilesInFolders(input.folders)) {
		const content = await input.vault.readNote(notePath);
		const { local } = classifyRefs(input.parse(content));
		for (const ref of local) {
			const resolved = input.vault.resolveLocalPath(ref.target, notePath);
			const bytes = resolved === null ? null : input.vault.fileSize(resolved);
			const localPath = resolved !== null && bytes !== null
				? resolved
				: `unresolved:${notePath}:${ref.source}`;
			let group = grouped.get(localPath);
			if (!group) {
				group = {
					bytes: bytes ?? 0,
					found: resolved !== null && bytes !== null,
					refs: []
				};
				grouped.set(localPath, group);
			}
			group.refs.push({
				notePath,
				source: ref.source,
				status: group.found ? 'pending' : 'failed'
			});
			if (!group.found) {
				const last = group.refs[group.refs.length - 1];
				if (last) {
					last.error = t('errors.localImageNotFound');
				}
			}
		}
	}

	const now = Date.now();
	const items: MigrationItem[] = [...grouped.entries()].map(([localPath, group]) => {
		const item: MigrationItem = {
			bytes: group.bytes,
			localPath,
			refs: group.refs,
			status: group.found ? 'pending' : 'failed'
		};
		if (!group.found) {
			item.error = t('errors.localImageNotFound');
		}
		return item;
	});
	const plan: MigrationPlan = {
		createdAt: now,
		deleteSourceAfterUpload: input.deleteSourceAfterUpload,
		folders: [...input.folders],
		items,
		profileId: input.profile.id,
		provider: input.profile.provider,
		stats: {
			doneCount: 0,
			failedCount: 0,
			noteCount: 0,
			totalBytes: 0,
			totalRefs: 0,
			uniqueFiles: 0
		},
		status: 'scanned',
		updatedAt: now,
		urlPattern: buildMigrationUrlPattern(input.profile),
		version: 1
	};
	refreshMigrationStats(plan);
	return plan;
}
