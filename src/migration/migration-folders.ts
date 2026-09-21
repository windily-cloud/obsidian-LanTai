import { t } from '../i18n/index.ts';

interface MigrationFoldersFailure {
	readonly message: string;
	readonly ok: false;
}

interface MigrationFoldersSuccess {
	readonly folders: string[];
	readonly ok: true;
}

type ParseMigrationFoldersResult = MigrationFoldersFailure | MigrationFoldersSuccess;

const OBSIDIAN_CONFIG_DIR_NAME = '.obsidian';

/** Sentinel stored in a plan when the user picks All (the whole vault). */
export const MIGRATION_ALL_FOLDERS = '/';

export function addMigrationFolder(current: readonly string[], added: string): string[] {
	if (isAllFolders(added)) {
		return [MIGRATION_ALL_FOLDERS];
	}
	const path = normalizeVaultPath(added);
	if (path === '' || isObsidianPath(path) || hasParentSegment(path) || isAbsolutePath(added)) {
		return current.filter((folder) => !isAllFolders(folder));
	}
	const withoutAll = current.filter((folder) => !isAllFolders(folder));
	if (withoutAll.some((folder) => path === folder || path.startsWith(`${folder}/`))) {
		return withoutAll;
	}
	return [...withoutAll.filter((folder) => !folder.startsWith(`${path}/`)), path];
}

export function assertMigrationFoldersExist(
	folders: readonly string[],
	folderExists: (path: string) => boolean
): ParseMigrationFoldersResult {
	for (const folder of folders) {
		if (isAllFolders(folder)) {
			continue;
		}
		if (!folderExists(folder)) {
			return { message: t('migration.folderNotFound', { path: folder }), ok: false };
		}
	}
	return { folders: [...folders], ok: true };
}

export function availableMigrationFolderPaths(
	vaultFolderPaths: readonly string[],
	selected: readonly string[],
	configDir: string = OBSIDIAN_CONFIG_DIR_NAME
): string[] {
	if (selected.some(isAllFolders)) {
		return [];
	}
	return [...vaultFolderPaths]
		.filter((path) => {
			if (path === '' || isAllFolders(path) || isSkippedFolder(path, configDir)) {
				return false;
			}
			return !selected.some((folder) => path === folder || path.startsWith(`${folder}/`));
		})
		.sort((left, right) => left.localeCompare(right));
}

export function isAllFolders(path: string): boolean {
	return path === MIGRATION_ALL_FOLDERS || normalizeVaultPath(path) === '';
}

/** Exposed for unit tests. */
export function isNoteInSelectedFolders(notePath: string, folders: readonly string[]): boolean {
	const note = normalizeVaultPath(notePath);
	if (note === '' || isObsidianPath(note)) {
		return false;
	}
	if (folders.some(isAllFolders)) {
		return true;
	}
	return folders.some((folder) => {
		const prefix = normalizeVaultPath(folder);
		return note === prefix || note.startsWith(`${prefix}/`);
	});
}

export function isObsidianPath(path: string): boolean {
	const normalized = normalizeVaultPath(path);
	return normalized === OBSIDIAN_CONFIG_DIR_NAME || normalized.startsWith(`${OBSIDIAN_CONFIG_DIR_NAME}/`);
}

export function migrationFolderLabel(path: string): string {
	return isAllFolders(path) ? t('migration.allFolders') : path;
}

export function resolveMigrationFolders(folders: readonly string[]): ParseMigrationFoldersResult {
	if (folders.length === 0) {
		return { message: t('migration.emptyFolders'), ok: false };
	}
	if (folders.some(isAllFolders)) {
		return { folders: [MIGRATION_ALL_FOLDERS], ok: true };
	}
	const unique: string[] = [];
	const seen = new Set<string>();
	for (const folder of folders) {
		const normalized = normalizeVaultPath(folder);
		if (normalized === '' || isObsidianPath(normalized)) {
			continue;
		}
		if (hasParentSegment(normalized) || isAbsolutePath(folder)) {
			return { message: t('migration.invalidFolder', { path: folder }), ok: false };
		}
		if (seen.has(normalized)) {
			continue;
		}
		seen.add(normalized);
		unique.push(normalized);
	}
	if (unique.length === 0) {
		return { message: t('migration.emptyFolders'), ok: false };
	}
	return { folders: unique, ok: true };
}

function hasParentSegment(path: string): boolean {
	return path.split('/').includes('..') || path.split('/').includes('.');
}

function isAbsolutePath(path: string): boolean {
	return path.startsWith('/') || path.startsWith('\\') || /^[A-Za-z]:[\\/]/u.test(path);
}

function isSkippedFolder(path: string, configDir: string): boolean {
	const normalized = normalizeVaultPath(path);
	const config = normalizeVaultPath(configDir);
	return isObsidianPath(normalized)
		|| (config !== '' && (normalized === config || normalized.startsWith(`${config}/`)));
}

function normalizeVaultPath(path: string): string {
	return path.replaceAll('\\', '/').replace(/\/+/gu, '/').replace(/^\/+/u, '').replace(/\/+$/u, '');
}
