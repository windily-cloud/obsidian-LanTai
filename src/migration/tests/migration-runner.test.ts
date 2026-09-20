import { noopAsync } from 'obsidian-dev-utils/function';
import {
	describe,
	expect,
	it,
	vi
} from 'vitest';

import type { NoteContent } from '../../adapters/obsidian/note-content.obsidian.ts';
import type { PreparedUploadSession } from '../../storage/prepare-upload-session.ts';
import type { MigrationPlanStore } from '../migration-plan-store.ts';
import type { MigrationPlan } from '../migration-plan.ts';

import { LocalImageUploadService } from '../../actions/local-image-upload-service.ts';
import { UploadAction } from '../../actions/upload-action.ts';
import { FakeNoteContent } from '../../adapters/obsidian/tests/fake-note-content.ts';
import { FakeVaultBinary } from '../../adapters/obsidian/tests/fake-vault-binary.ts';
import { ImageLinkFormatter } from '../../link/image-link-formatter.ts';
import { ImageLinkParser } from '../../link/image-link-parser.ts';
import { ImageLinkService } from '../../link/image-link-service.ts';
import { AttachmentPathResolver } from '../../path/attachment-path-resolver.ts';
import { NameTemplateEngine } from '../../path/name-template-engine.ts';
import { PluginSettings } from '../../settings/plugin-settings.ts';
import { StorageRequestError } from '../../storage/storage-request-error.ts';
import { FakeObjectStorage } from '../../storage/tests/fake-object-storage.ts';
import { MIGRATION_PLAN_VERSION } from '../migration-plan.ts';
import { MigrationRunner } from '../migration-runner.ts';
import { MigrationUploadPacer } from '../migration-upload-pacer.ts';

interface CreateRunnerOptions {
	hasLocalReference?(): Promise<boolean>;
	readonly notes?: Record<string, FakeNoteContent>;
	readonly pacer?: MigrationUploadPacer;
	readonly storage?: FakeObjectStorage;
	readonly store?: MemoryMigrationPlanStore;
	readonly vault?: FakeVaultBinary;
}

interface CreateRunnerResult {
	readonly notes: Record<string, FakeNoteContent>;
	readonly runner: MigrationRunner;
	readonly settings: PluginSettings;
	readonly storage: FakeObjectStorage;
	readonly store: MemoryMigrationPlanStore;
	readonly vault: FakeVaultBinary;
}

interface EmptyMigrationLoadResult {
	readonly ok: true;
	readonly plan: null;
}

class MemoryMigrationPlanStore implements MigrationPlanStore {
	public deleted = false;
	public readonly path = 'lantai-migration.json';
	public saved: MigrationPlan[] = [];

	public delete(): Promise<void> {
		this.deleted = true;
		return noopAsync();
	}

	public load(): Promise<EmptyMigrationLoadResult> {
		return Promise.resolve({ ok: true, plan: null });
	}

	public save(plan: MigrationPlan): Promise<void> {
		this.saved.push(structuredClone(plan));
		this.deleted = false;
		return noopAsync();
	}
}

function createPlan(partial?: Partial<MigrationPlan>): MigrationPlan {
	return {
		createdAt: 1,
		deleteSourceAfterUpload: false,
		folders: ['Journal'],
		items: [
			{
				bytes: 1,
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
			noteCount: 1,
			totalBytes: 1,
			totalRefs: 1,
			uniqueFiles: 1
		},
		status: 'scanned',
		updatedAt: 1,
		// eslint-disable-next-line no-template-curly-in-string -- pattern string
		urlPattern: 'https://cdn.example.com/images/${originalName}.${ext}',
		version: MIGRATION_PLAN_VERSION,
		...partial
	};
}

function createRunner(options?: CreateRunnerOptions): CreateRunnerResult {
	const notes = options?.notes ?? { 'Journal/a.md': new FakeNoteContent('![[photo.png]]') };
	const vault = options?.vault ?? new FakeVaultBinary({ 'Journal/photo.png': new Uint8Array([1]) });
	const storage = options?.storage ?? new FakeObjectStorage({ publicBaseUrl: 'https://cdn.example.com' });
	const store = options?.store ?? new MemoryMigrationPlanStore();
	const parser = new ImageLinkParser();
	const settings = new PluginSettings();
	settings.activeProfileId = 'p1';
	settings.profiles = [{
		accessKeyIdSecretName: 'ak',
		bucket: 'b',
		id: 'p1',
		name: 'S3',
		// eslint-disable-next-line no-template-curly-in-string -- name-template token syntax
		objectKeyTemplate: 'images/${originalName}.${ext}',
		provider: 's3',
		publicBaseUrl: 'https://cdn.example.com',
		secretAccessKeySecretName: 'sk'
	}];
	const pathResolver = new AttachmentPathResolver(new NameTemplateEngine());
	const profile = settings.profiles[0];
	if (!profile) {
		throw new Error('missing profile');
	}
	const runner = new MigrationRunner({
		hasLocalReference: (): Promise<boolean> =>
			options?.hasLocalReference
				? options.hasLocalReference()
				: Promise.resolve(false),
		openNote: (notePath): Promise<NoteContent | null> => Promise.resolve(notes[notePath] ?? null),
		pacer: options?.pacer ?? new MigrationUploadPacer({ intervalMs: 0, sleep: (): Promise<void> => noopAsync() }),
		pathResolver,
		prepareSession: (): Promise<PreparedUploadSession> =>
			Promise.resolve({
				ok: true,
				profile,
				storage
			}),
		recordUpload: vi.fn().mockResolvedValue(undefined),
		settings,
		store,
		upload: new LocalImageUploadService({
			parser,
			resolveVaultPath: (target, noteFilePath): string => {
				const folder = noteFilePath.includes('/')
					? noteFilePath.slice(0, noteFilePath.lastIndexOf('/'))
					: '';
				return folder ? `${folder}/${target}` : target;
			},
			uploadAction: new UploadAction(
				pathResolver,
				new ImageLinkService(parser, new ImageLinkFormatter())
			)
		}),
		vault
	});
	return { notes, runner, settings, storage, store, vault };
}

describe('MigrationRunner', () => {
	it('uploads, rewrites, and deletes the plan when every item succeeds', async () => {
		const { notes, runner, storage, store } = createRunner();
		const plan = await runner.run({
			plan: createPlan(),
			shouldPause: (): boolean => false
		});
		expect(plan.status).toBe('completed');
		expect(store.deleted).toBe(true);
		expect(storage.uploadedKeys).toEqual(['images/photo.png']);
		expect(notes['Journal/a.md']?.getContent()).toBe(
			'![](https://cdn.example.com/images/photo.png)'
		);
	});

	it('persists uploaded key before rewrite for LanTai and resumes without re-uploading', async () => {
		const storage = new FakeObjectStorage({
			clientKeyed: false,
			publicBaseUrl: 'https://cdn.lantai.pkmer.cn',
			uploadedObject: {
				key: '1758.webp',
				url: 'https://cdn.lantai.pkmer.cn/u1/1758.webp'
			}
		});
		const store = new MemoryMigrationPlanStore();
		const note = new FakeNoteContent('![[photo.png]]');
		const { runner } = createRunner({
			notes: { 'Journal/a.md': note },
			storage,
			store
		});
		const plan = createPlan({
			provider: 'lantai',
			// eslint-disable-next-line no-template-curly-in-string -- pattern string
			urlPattern: 'https://cdn.lantai.pkmer.cn/${id}'
		});
		const uploadedSaves: MigrationPlan[] = [];
		const originalSave = store.save.bind(store);
		store.save = async (next): Promise<void> => {
			if (next.items[0]?.status === 'uploaded') {
				uploadedSaves.push(structuredClone(next));
			}
			await originalSave(next);
		};
		await runner.run({ plan, shouldPause: (): boolean => false });
		expect(uploadedSaves.length).toBeGreaterThan(0);
		expect(uploadedSaves[0]?.items[0]?.uploadedKey).toBe('1758.webp');
		expect(note.getContent()).toBe('![](https://cdn.lantai.pkmer.cn/u1/1758.webp)');

		storage.uploadedKeys.length = 0;
		await note.setContent('![[photo.png]]');
		const resumed = createPlan({
			items: [{
				bytes: 1,
				localPath: 'Journal/photo.png',
				refs: [{ notePath: 'Journal/a.md', source: '![[photo.png]]', status: 'pending' }],
				status: 'uploaded',
				uploadedKey: '1758.webp',
				uploadedUrl: 'https://cdn.lantai.pkmer.cn/u1/1758.webp'
			}]
		});
		const { runner: resumeRunner, storage: resumeStorage } = createRunner({
			notes: { 'Journal/a.md': note },
			storage
		});
		await resumeRunner.run({ plan: resumed, shouldPause: (): boolean => false });
		expect(resumeStorage.uploadedKeys).toHaveLength(0);
		expect(note.getContent()).toBe('![](https://cdn.lantai.pkmer.cn/u1/1758.webp)');
	});

	it('marks a content-different object key as failed and leaves markdown unchanged', async () => {
		const note = new FakeNoteContent('![[photo.png]]');
		const storage = new FakeObjectStorage({
			objectBytes: { 'images/photo.png': new Uint8Array([9, 9, 9]) },
			publicBaseUrl: 'https://cdn.example.com'
		});
		const { runner } = createRunner({
			notes: { 'Journal/a.md': note },
			storage,
			vault: new FakeVaultBinary({ 'Journal/photo.png': new Uint8Array([1]) })
		});
		const plan = await runner.run({
			plan: createPlan(),
			shouldPause: (): boolean => false
		});
		expect(plan.items[0]?.status).toBe('failed');
		expect(note.getContent()).toBe('![[photo.png]]');
		expect(storage.uploadedKeys).toHaveLength(0);
	});

	it('uses linkOnly when the remote object has the same bytes', async () => {
		const bytes = new Uint8Array([1, 2, 3]);
		const note = new FakeNoteContent('![[photo.png]]');
		const storage = new FakeObjectStorage({
			objectBytes: { 'images/photo.png': bytes },
			publicBaseUrl: 'https://cdn.example.com'
		});
		const { runner } = createRunner({
			notes: { 'Journal/a.md': note },
			storage,
			vault: new FakeVaultBinary({ 'Journal/photo.png': bytes })
		});
		await runner.run({ plan: createPlan(), shouldPause: (): boolean => false });
		expect(storage.uploadedKeys).toHaveLength(0);
		expect(note.getContent()).toBe('![](https://cdn.example.com/images/photo.png)');
	});

	it('skips done items and retries failed ones', async () => {
		const doneNote = new FakeNoteContent('![](https://cdn.example.com/images/done.png)');
		const failNote = new FakeNoteContent('![[photo.png]]');
		const { runner, storage } = createRunner({
			notes: {
				'Journal/a.md': failNote,
				'Journal/done.md': doneNote
			},
			vault: new FakeVaultBinary({
				'Journal/done.png': new Uint8Array([1]),
				'Journal/photo.png': new Uint8Array([1])
			})
		});
		const plan = createPlan({
			items: [
				{
					bytes: 1,
					localPath: 'Journal/done.png',
					refs: [{ notePath: 'Journal/done.md', source: '![[done.png]]', status: 'done' }],
					status: 'done'
				},
				{
					bytes: 1,
					error: 'boom',
					localPath: 'Journal/photo.png',
					refs: [{ error: 'boom', notePath: 'Journal/a.md', source: '![[photo.png]]', status: 'failed' }],
					status: 'failed'
				}
			]
		});
		await runner.run({ plan, shouldPause: (): boolean => false });
		expect(storage.uploadedKeys).toEqual(['images/photo.png']);
		expect(failNote.getContent()).toBe('![](https://cdn.example.com/images/photo.png)');
		expect(plan.items[0]?.status).toBe('done');
		expect(plan.items[1]?.status).toBe('done');
	});

	it('does not mutate PluginSettings.deleteSourceAfterUpload', async () => {
		const { runner, settings, vault } = createRunner();
		expect(settings.deleteSourceAfterUpload).toBe(false);
		await runner.run({
			plan: createPlan({ deleteSourceAfterUpload: true }),
			shouldPause: (): boolean => false
		});
		expect(settings.deleteSourceAfterUpload).toBe(false);
		expect(vault.trashed).toContain('Journal/photo.png');
	});

	it('does not trash the source while other vault notes still reference it', async () => {
		const { runner, vault } = createRunner({
			hasLocalReference: (): Promise<boolean> => Promise.resolve(true)
		});
		await runner.run({
			plan: createPlan({ deleteSourceAfterUpload: true }),
			shouldPause: (): boolean => false
		});
		expect(vault.trashed).toEqual([]);
	});

	it('fails a changed ref and continues rewriting other notes', async () => {
		const noteA = new FakeNoteContent('![[photo.png]]');
		const noteB = new FakeNoteContent('changed');
		const { runner, vault } = createRunner({
			notes: {
				'Journal/a.md': noteA,
				'Journal/b.md': noteB
			}
		});
		const plan = await runner.run({
			plan: createPlan({
				items: [{
					bytes: 1,
					localPath: 'Journal/photo.png',
					refs: [
						{ notePath: 'Journal/a.md', source: '![[photo.png]]', status: 'pending' },
						{ notePath: 'Journal/b.md', source: '![[photo.png]]', status: 'pending' }
					],
					status: 'pending'
				}]
			}),
			shouldPause: (): boolean => false
		});
		expect(noteA.getContent()).toBe('![](https://cdn.example.com/images/photo.png)');
		expect(noteB.getContent()).toBe('changed');
		expect(plan.items[0]?.status).toBe('failed');
		expect(plan.items[0]?.refs[0]?.status).toBe('done');
		expect(plan.items[0]?.refs[1]?.status).toBe('failed');
		expect(vault.trashed).toEqual([]);
	});

	it('pauses after the current file when shouldPause becomes true', async () => {
		const second = new FakeNoteContent('![[other.png]]');
		const { runner, storage } = createRunner({
			notes: {
				'Journal/a.md': new FakeNoteContent('![[photo.png]]'),
				'Journal/b.md': second
			},
			vault: new FakeVaultBinary({
				'Journal/other.png': new Uint8Array([2]),
				'Journal/photo.png': new Uint8Array([1])
			})
		});
		let seen = 0;
		const plan = await runner.run({
			onProgress: (): void => {
				seen += 1;
			},
			plan: createPlan({
				items: [
					{
						bytes: 1,
						localPath: 'Journal/photo.png',
						refs: [{ notePath: 'Journal/a.md', source: '![[photo.png]]', status: 'pending' }],
						status: 'pending'
					},
					{
						bytes: 1,
						localPath: 'Journal/other.png',
						refs: [{ notePath: 'Journal/b.md', source: '![[other.png]]', status: 'pending' }],
						status: 'pending'
					}
				]
			}),
			shouldPause: (): boolean => seen >= 1
		});
		expect(plan.status).toBe('paused');
		expect(plan.items[0]?.status).toBe('done');
		expect(plan.items[1]?.status).toBe('pending');
		expect(storage.uploadedKeys).toEqual(['images/photo.png']);
		expect(second.getContent()).toBe('![[other.png]]');
	});

	it('retries a 429 upload after backoff and then succeeds', async () => {
		const sleeps: number[] = [];
		const storage = new FakeObjectStorage({
			publicBaseUrl: 'https://cdn.example.com',
			uploadErrors: [
				new StorageRequestError('Provider', 'Too many requests', { retryAfterMs: 50, status: 429 })
			]
		});
		const { notes, runner } = createRunner({
			pacer: new MigrationUploadPacer({
				intervalMs: 0,
				random: (): number => 1,
				sleep: (ms): Promise<void> => {
					sleeps.push(ms);
					return noopAsync();
				}
			}),
			storage
		});
		const plan = await runner.run({
			plan: createPlan(),
			shouldPause: (): boolean => false
		});
		expect(plan.status).toBe('completed');
		expect(storage.uploadedKeys).toEqual(['images/photo.png']);
		expect(notes['Journal/a.md']?.getContent()).toBe(
			'![](https://cdn.example.com/images/photo.png)'
		);
		expect(sleeps).toEqual([50]);
	});
});
