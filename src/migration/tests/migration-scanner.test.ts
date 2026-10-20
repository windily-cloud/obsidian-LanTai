import {
	describe,
	expect,
	it
} from 'vitest';

import type { StorageProfile } from '../../settings/sections/s3/storage-profile.ts';
import type { MigrationScanVault } from '../migration-scanner.ts';

import { ImageLinkParser } from '../../link/image-link-parser.ts';
import { isNoteInSelectedFolders } from '../migration-folders.ts';
import { scanMigrationPlan } from '../migration-scanner.ts';
import { LANTAI_MIGRATION_URL_PATTERN } from '../migration-url-pattern.ts';

function s3Profile(
	publicBaseUrl = 'https://cdn.example.com',
	// eslint-disable-next-line no-template-curly-in-string -- name-template token syntax
	objectKeyTemplate = 'images/${originalName}.${ext}'
): StorageProfile {
	return {
		accessKeyIdSecretName: 'ak',
		bucket: 'bucket',
		id: 's3',
		name: 'S3',
		objectKeyTemplate,
		provider: 's3',
		publicBaseUrl,
		secretAccessKeySecretName: 'sk'
	};
}

function vault(files: Record<string, string>, binaries: Record<string, number>): MigrationScanVault {
	return {
		fileSize: (path): null | number => (path in binaries ? binaries[path] ?? null : null),
		folderExists: (path): boolean => path === 'Journal' || path === 'Notes',
		listMarkdownFilesInFolders: (folders): string[] => Object.keys(files).filter((path) => isNoteInSelectedFolders(path, folders)),
		readNote: (path): string => files[path] ?? '',
		resolveLocalPath: (target, noteFilePath): null | string => {
			if (target in binaries) {
				return target;
			}
			const parts = noteFilePath.split('/');
			parts.pop();
			while (parts.length > 0) {
				const candidate = `${parts.join('/')}/${target}`;
				if (candidate in binaries) {
					return candidate;
				}
				parts.pop();
			}
			return null;
		}
	};
}

describe('scanMigrationPlan', () => {
	it('dedupes the same local file across notes and recurses into subfolders', async () => {
		const plan = await scanMigrationPlan({
			deleteSourceAfterUpload: false,
			folders: ['Journal'],
			parse: (content) => new ImageLinkParser().parse(content),
			profile: s3Profile(),
			vault: vault(
				{
					'.obsidian/app.md': '![[photo.png]]',
					'Journal/2024/a.md': '![[photo.png]]',
					'Journal/b.md': '![](photo.png)',
					'Notes/c.md': '![[photo.png]]'
				},
				{ 'Journal/photo.png': 12 }
			)
		});
		expect(plan.items).toHaveLength(1);
		expect(plan.items[0]?.localPath).toBe('Journal/photo.png');
		expect(plan.stats).toMatchObject({
			noteCount: 2,
			totalBytes: 12,
			totalRefs: 2,
			uniqueFiles: 1
		});
		expect(plan.urlPattern).toBe(
			// eslint-disable-next-line no-template-curly-in-string -- asserting unresolved tokens
			'https://cdn.example.com/images/${originalName}.${ext}'
		);
	});

	it('keeps one item per note when the object key template uses note context', async () => {
		const plan = await scanMigrationPlan({
			deleteSourceAfterUpload: false,
			folders: ['Journal', 'Notes'],
			parse: (content) => new ImageLinkParser().parse(content),
			profile: s3Profile(
				undefined,
				// eslint-disable-next-line no-template-curly-in-string -- name-template token syntax
				'repository/images/${noteFolderPath}/${noteFileName}/${originalName}.${ext}'
			),
			vault: vault(
				{
					'Journal/a.md': '![[shared.png]]',
					'Notes/b.md': '![[shared.png]]',
					'Notes/c.md': '![[shared.png]]'
				},
				{ 'shared.png': 10 }
			)
		});
		expect(plan.items).toHaveLength(3);
		expect(
			plan.items
				.flatMap((item) => item.refs.map((ref) => ref.notePath))
				.sort()
		).toEqual(['Journal/a.md', 'Notes/b.md', 'Notes/c.md']);
		expect(plan.stats).toMatchObject({
			noteCount: 3,
			totalRefs: 3,
			uniqueFiles: 1
		});
	});

	it('records missing files as failed and uses the LanTai url pattern', async () => {
		const plan = await scanMigrationPlan({
			deleteSourceAfterUpload: true,
			folders: ['Journal'],
			parse: (content) => new ImageLinkParser().parse(content),
			profile: {
				...s3Profile(),
				id: 'lantai',
				provider: 'lantai',
				publicBaseUrl: ''
			},
			vault: vault(
				{ 'Journal/a.md': '![[missing.png]]' },
				{}
			)
		});
		expect(plan.urlPattern).toBe(LANTAI_MIGRATION_URL_PATTERN);
		expect(plan.items[0]?.status).toBe('failed');
		expect(plan.stats.failedCount).toBe(1);
	});
});
