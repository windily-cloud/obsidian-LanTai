import {
	describe,
	expect,
	it
} from 'vitest';

import { t } from '../../i18n/index.ts';
import {
	addMigrationFolder,
	assertMigrationFoldersExist,
	availableMigrationFolderPaths,
	isNoteInSelectedFolders,
	MIGRATION_ALL_FOLDERS,
	migrationFolderLabel,
	resolveMigrationFolders
} from '../migration-folders.ts';

describe('resolveMigrationFolders', () => {
	it('rejects an empty list', () => {
		expect(resolveMigrationFolders([])).toEqual({
			message: t('migration.emptyFolders'),
			ok: false
		});
		expect(resolveMigrationFolders(['.obsidian'])).toEqual({
			message: t('migration.emptyFolders'),
			ok: false
		});
	});

	it('keeps All as the whole-vault sentinel', () => {
		expect(resolveMigrationFolders([MIGRATION_ALL_FOLDERS, 'Journal'])).toEqual({
			folders: [MIGRATION_ALL_FOLDERS],
			ok: true
		});
	});

	it('rejects parent segments', () => {
		expect(resolveMigrationFolders(['Journal/../secret'])).toEqual({
			message: t('migration.invalidFolder', { path: 'Journal/../secret' }),
			ok: false
		});
	});

	it('normalizes unique folders', () => {
		expect(resolveMigrationFolders(['Journal/', 'Journal', 'Notes'])).toEqual({
			folders: ['Journal', 'Notes'],
			ok: true
		});
	});
});

describe('addMigrationFolder', () => {
	it('makes All exclusive and drops covered children', () => {
		expect(addMigrationFolder(['Journal'], MIGRATION_ALL_FOLDERS)).toEqual([MIGRATION_ALL_FOLDERS]);
		expect(addMigrationFolder(['Journal/2024'], 'Journal')).toEqual(['Journal']);
		expect(addMigrationFolder([MIGRATION_ALL_FOLDERS], 'Notes')).toEqual(['Notes']);
	});
});

describe('availableMigrationFolderPaths', () => {
	it('omits All, selected folders, and nested children', () => {
		expect(availableMigrationFolderPaths(
			['Journal', 'Journal/2024', 'Notes', '.obsidian'],
			['Journal']
		)).toEqual(['Notes']);
		expect(availableMigrationFolderPaths(['Journal', 'Notes'], [MIGRATION_ALL_FOLDERS])).toEqual([]);
	});
});

describe('assertMigrationFoldersExist', () => {
	it('rejects missing folders but treats All as present', () => {
		expect(assertMigrationFoldersExist(['Journal'], () => false)).toEqual({
			message: t('migration.folderNotFound', { path: 'Journal' }),
			ok: false
		});
		expect(assertMigrationFoldersExist([MIGRATION_ALL_FOLDERS], () => false)).toEqual({
			folders: [MIGRATION_ALL_FOLDERS],
			ok: true
		});
	});
});

describe('isNoteInSelectedFolders', () => {
	it('includes nested notes and skips .obsidian', () => {
		expect(isNoteInSelectedFolders('Journal/2024/a.md', ['Journal'])).toBe(true);
		expect(isNoteInSelectedFolders('Journal.md', ['Journal'])).toBe(false);
		expect(isNoteInSelectedFolders('.obsidian/app.md', ['Journal'])).toBe(false);
	});

	it('treats All as every note except the config folder', () => {
		expect(isNoteInSelectedFolders('outside.md', [MIGRATION_ALL_FOLDERS])).toBe(true);
		expect(isNoteInSelectedFolders('.obsidian/app.md', [MIGRATION_ALL_FOLDERS])).toBe(false);
	});
});

describe('migrationFolderLabel', () => {
	it('shows All for the whole-vault sentinel', () => {
		expect(migrationFolderLabel(MIGRATION_ALL_FOLDERS)).toBe(t('migration.allFolders'));
		expect(migrationFolderLabel('Journal')).toBe('Journal');
	});
});
