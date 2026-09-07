import {
	describe,
	expect,
	it,
	vi
} from 'vitest';

import type { ImageRef } from '../../link/image-ref.ts';
import type { StorageProfile } from '../../settings/sections/s3/storage-profile.ts';
import type { ImageActionContext } from '../image-action-facade.ts';
import type { ConfirmOverwrite } from '../upload-conflict-coordinator.ts';

import { FakeNoteContent } from '../../adapters/obsidian/tests/fake-note-content.ts';
import { FakeVaultBinary } from '../../adapters/obsidian/tests/fake-vault-binary.ts';
import { t } from '../../i18n/index.ts';
import { ImageLinkFormatter } from '../../link/image-link-formatter.ts';
import { ImageLinkParser } from '../../link/image-link-parser.ts';
import { ImageLinkService } from '../../link/image-link-service.ts';
import { AttachmentPathResolver } from '../../path/attachment-path-resolver.ts';
import { NameTemplateEngine } from '../../path/name-template-engine.ts';
import { PluginSettings } from '../../settings/plugin-settings.ts';
import { FakeObjectStorage } from '../../storage/tests/fake-object-storage.ts';
import { DownloadAction } from '../download-action.ts';
import {
	classifyRefs,
	ImageActionFacade
} from '../image-action-facade.ts';
import { LocalizeAction } from '../localize-action.ts';
import { UploadAction } from '../upload-action.ts';

describe('classifyRefs', () => {
	it('separates local and remote image references while preserving order', () => {
		const refs: ImageRef[] = [
			{
				decorations: [],
				end: 14,
				isRemote: false,
				kind: 'wiki',
				markdownTitle: null,
				source: '![[local.png]]',
				start: 0,
				target: 'local.png'
			},
			{
				decorations: [],
				end: 25,
				isRemote: true,
				kind: 'markdown',
				markdownTitle: null,
				source: '![](https://example.com/a)',
				start: 0,
				target: 'https://example.com/a'
			},
			{
				decorations: [],
				end: 22,
				isRemote: false,
				kind: 'markdown',
				markdownTitle: null,
				source: '![](folder/second.jpg)',
				start: 0,
				target: 'folder/second.jpg'
			}
		];

		expect(classifyRefs(refs)).toEqual({
			local: [refs[0], refs[2]],
			remote: [refs[1]]
		});
	});
});

interface BuildFacadeOptions {
	readonly confirmOverwrite?: ConfirmOverwrite;
	readonly profiles?: StorageProfile[];
	readonly settings?: Partial<PluginSettings>;
	readonly storage?: FakeObjectStorage;
	readonly vault?: FakeVaultBinary;
}

interface FacadeHarness {
	facade: ImageActionFacade;
	storage: FakeObjectStorage;
	vault: FakeVaultBinary;
}

interface NoteDoneRecord {
	note: string;
	results: number;
}

function buildFacade(options: BuildFacadeOptions = {}): FacadeHarness {
	const pathResolver = new AttachmentPathResolver(new NameTemplateEngine());
	const linkService = new ImageLinkService(new ImageLinkParser(), new ImageLinkFormatter());
	const storage = options.storage
		?? new FakeObjectStorage({ publicBaseUrl: 'https://cdn.example.com' });
	const vault = options.vault ?? new FakeVaultBinary();
	const profiles = options.profiles ?? [testProfile()];
	const settings = Object.assign(new PluginSettings(), {
		activeProfileId: profiles[0]?.id ?? null,
		profiles,
		...options.settings
	});
	const facade = new ImageActionFacade({
		confirmOverwrite: options.confirmOverwrite ?? vi.fn().mockResolvedValue(false),
		createStorage: (): Promise<FakeObjectStorage> => Promise.resolve(storage),
		download: { save: vi.fn().mockResolvedValue(undefined) },
		downloadAction: new DownloadAction(),
		getSecret: (name: string): string => name,
		hasLocalReference: vi.fn().mockResolvedValue(false),
		http: { fetchBinary: vi.fn() },
		localizeAction: new LocalizeAction(pathResolver, linkService),
		parser: new ImageLinkParser(),
		pathResolver,
		recordUpload: vi.fn().mockResolvedValue(undefined),
		resolveVaultPath: (target: string, noteFilePath: string): string => {
			const slash = noteFilePath.lastIndexOf('/');
			const dir = slash === -1 ? '' : noteFilePath.slice(0, slash);
			return dir ? `${dir}/${target}` : target;
		},
		settings,
		uploadAction: new UploadAction(pathResolver, linkService),
		vault
	});
	return { facade, storage, vault };
}

function context(noteContent: string, noteFilePath: string): ImageActionContext {
	return {
		note: new FakeNoteContent(noteContent),
		noteFilePath
	};
}

function testProfile(): StorageProfile {
	return {
		accessKeyIdSecretName: 'access-key',
		bucket: 'bucket',
		id: 'profile-1',
		name: 'Test',
		// eslint-disable-next-line no-template-curly-in-string -- name-template token syntax
		objectKeyTemplate: 'images/${noteFileName}/${originalName}.${ext}',
		provider: 's3Compatible',
		publicBaseUrl: 'https://cdn.example.com',
		secretAccessKeySecretName: 'secret-key'
	};
}

describe('uploadAllLocalInNotes', () => {
	it('uploads local images across notes and reports per-note progress', async () => {
		const storage = new FakeObjectStorage({ publicBaseUrl: 'https://cdn.example.com' });
		const vault = new FakeVaultBinary({
			'a.png': new Uint8Array([1, 2, 3]),
			'Notes/b.png': new Uint8Array([4, 5, 6])
		});
		const { facade } = buildFacade({ storage, vault });
		const contexts = [
			context('![[a.png]]', 'A.md'),
			context('![[b.png]]', 'Notes/B.md'),
			context('![](https://remote.example/x.png)', 'C.md')
		];
		const done: NoteDoneRecord[] = [];
		const results = await facade.uploadAllLocalInNotes(
			contexts,
			(noteFilePath, noteResults): void => {
				done.push({ note: noteFilePath, results: noteResults.length });
			}
		);

		expect(results).toHaveLength(2);
		expect(results.every((result) => result.ok)).toBe(true);
		expect(done).toEqual([
			{ note: 'A.md', results: 1 },
			{ note: 'Notes/B.md', results: 1 }
		]);
		expect(storage.uploadedKeys).toEqual(['images/A/a.png', 'images/B/b.png']);
		expect(contexts[0]?.note.getContent()).toBe('![](https://cdn.example.com/images/A/a.png)');
		expect(contexts[1]?.note.getContent()).toBe('![](https://cdn.example.com/images/B/b.png)');
		expect(contexts[2]?.note.getContent()).toBe('![](https://remote.example/x.png)');
	});

	it('fails fast with a single result when no profile is active', async () => {
		const storage = new FakeObjectStorage({ publicBaseUrl: 'https://cdn.example.com' });
		const { facade } = buildFacade({ profiles: [], storage });
		const onNoteDone = vi.fn();
		const results = await facade.uploadAllLocalInNotes(
			[context('![[a.png]]', 'A.md')],
			onNoteDone
		);

		expect(results).toHaveLength(1);
		expect(results[0]).toMatchObject({ ok: false, reason: 'missing' });
		const [first] = results;
		expect(first?.ok === false ? first.message : undefined)
			.toBe(t('errors.noActiveStorageProfile'));
		expect(storage.uploadedKeys).toHaveLength(0);
		expect(onNoteDone).not.toHaveBeenCalled();
	});

	it('isolates a failing note and continues with the rest', async () => {
		const storage = new FakeObjectStorage({ publicBaseUrl: 'https://cdn.example.com' });
		const vault = new FakeVaultBinary({
			'Notes/b.png': new Uint8Array([4, 5, 6])
		});
		const { facade } = buildFacade({ storage, vault });
		const done: string[] = [];
		const results = await facade.uploadAllLocalInNotes(
			[
				context('![[a.png]]', 'A.md'),
				context('![[b.png]]', 'Notes/B.md')
			],
			(noteFilePath): void => {
				done.push(noteFilePath);
			}
		);

		expect(results).toHaveLength(2);
		expect(results[0]).toMatchObject({ ok: false, reason: 'error' });
		expect(results[1]?.ok).toBe(true);
		expect(storage.uploadedKeys).toEqual(['images/B/b.png']);
		expect(done).toEqual(['A.md', 'Notes/B.md']);
	});
});
