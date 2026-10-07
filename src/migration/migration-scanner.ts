import type { ImageRef } from '../link/image-ref.ts';
import type { StorageProfile } from '../settings/sections/s3/storage-profile.ts';
import type {
	MigrationItem,
	MigrationPlan,
	MigrationRef
} from './migration-plan.ts';

import { classifyRefs } from '../actions/image-action-facade.ts';
import { t } from '../i18n/index.ts';
import {
	MIGRATION_PLAN_VERSION,
	refreshMigrationStats
} from './migration-plan.ts';
import { buildMigrationUrlPattern } from './migration-url-pattern.ts';

/**
 * Object key 模板里与「笔记」绑定的 token 名。命中任意一个时，同一个本地文件在不同笔记下
 * **本应**得到不同的 key，因此扫描阶段不能跨笔记把引用合并成同一个 item。
 */
const NOTE_SCOPED_KEY_TOKEN_NAMES = [
	'noteFileName',
	'noteFilePath',
	'noteFolderName',
	'noteFolderPath'
] as const;

export interface MigrationScanVault {
	fileSize(path: string): null | number;
	folderExists(path: string): boolean;
	listMarkdownFilesInFolders(folders: readonly string[]): readonly string[];
	readNote(path: string): Promise<string> | string;
	resolveLocalPath(target: string, noteFilePath: string): null | string;
}

interface ScanGroup {
	bytes: number;
	found: boolean;
	localPath: string;
	refs: MigrationRef[];
}

interface ScanMigrationInput {
	readonly deleteSourceAfterUpload: boolean;
	readonly folders: readonly string[];
	parse(content: string): readonly ImageRef[];
	readonly profile: StorageProfile;
	readonly vault: MigrationScanVault;
}

/** Exposed for unit tests. */
export function isNoteScopedObjectKeyTemplate(template: string): boolean {
	return NOTE_SCOPED_KEY_TOKEN_NAMES.some((name) => template.includes(`\${${name}}`));
}

export async function scanMigrationPlan(input: ScanMigrationInput): Promise<MigrationPlan> {
	const noteScopedKeys = isNoteScopedObjectKeyTemplate(input.profile.objectKeyTemplate);
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
			// Key 模板引用笔记 token 时，同一个文件对不同笔记必须各自算 key，
			// 因此按「文件 + 笔记」分组，而不是仅按文件合并。
			const groupKey = noteScopedKeys ? `${localPath}\u0000${notePath}` : localPath;
			let group = grouped.get(groupKey);
			if (!group) {
				group = {
					bytes: bytes ?? 0,
					found: resolved !== null && bytes !== null,
					localPath,
					refs: []
				};
				grouped.set(groupKey, group);
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
	const items: MigrationItem[] = [...grouped.values()].map((group) => {
		const item: MigrationItem = {
			bytes: group.bytes,
			localPath: group.localPath,
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
		version: MIGRATION_PLAN_VERSION
	};
	refreshMigrationStats(plan);
	return plan;
}
