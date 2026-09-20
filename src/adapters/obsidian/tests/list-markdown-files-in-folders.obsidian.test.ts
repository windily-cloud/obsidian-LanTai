import { App } from 'obsidian-test-mocks/obsidian';
import {
	describe,
	expect,
	it
} from 'vitest';

import { MIGRATION_ALL_FOLDERS } from '../../../migration/migration-folders.ts';
import { listMarkdownFilesInFolders } from '../list-markdown-files-in-folders.obsidian.ts';

describe('listMarkdownFilesInFolders', () => {
	it('lists markdown notes via Vault.recurseChildren', () => {
		const app = App.createConfigured__({
			files: {
				'Journal/2024/a.md': '',
				'Journal/photo.png': '',
				'Notes/c.md': '',
				'outside.md': ''
			}
		});

		expect(listMarkdownFilesInFolders(app.asOriginalType__(), ['Journal', 'Notes'])).toEqual([
			'Journal/2024/a.md',
			'Notes/c.md'
		]);
	});

	it('lists every markdown note when All is selected', () => {
		const app = App.createConfigured__({
			files: {
				'Journal/2024/a.md': '',
				'Notes/c.md': '',
				'outside.md': ''
			}
		});

		expect([...listMarkdownFilesInFolders(app.asOriginalType__(), [MIGRATION_ALL_FOLDERS])].sort()).toEqual([
			'Journal/2024/a.md',
			'Notes/c.md',
			'outside.md'
		]);
	});
});
