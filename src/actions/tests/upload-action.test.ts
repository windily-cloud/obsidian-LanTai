import {
	describe,
	expect,
	it,
	vi
} from 'vitest';

import type { ImageRef } from '../../link/image-ref.ts';
import type { NameTemplateContext } from '../../path/name-template-context.ts';

import { FakeNoteContent } from '../../adapters/obsidian/tests/fake-note-content.ts';
import { FakeVaultBinary } from '../../adapters/obsidian/tests/fake-vault-binary.ts';
import { ImageLinkFormatter } from '../../link/image-link-formatter.ts';
import { ImageLinkParser } from '../../link/image-link-parser.ts';
import { ImageLinkService } from '../../link/image-link-service.ts';
import { AttachmentPathResolver } from '../../path/attachment-path-resolver.ts';
import { NameTemplateEngine } from '../../path/name-template-engine.ts';
import { FakeObjectStorage } from '../../storage/tests/fake-object-storage.ts';
import { UploadAction } from '../upload-action.ts';

function createAction(): UploadAction {
	return new UploadAction(
		new AttachmentPathResolver(new NameTemplateEngine()),
		new ImageLinkService(new ImageLinkParser(), new ImageLinkFormatter())
	);
}

function ctx(partial?: Partial<NameTemplateContext>): NameTemplateContext {
	return {
		ext: 'png',
		noteFileName: 'MyNote',
		noteFilePath: 'Journal/MyNote',
		noteFolderName: 'Journal',
		noteFolderPath: 'Journal',
		now: new Date(2026, 6, 22, 12, 0, 0),
		originalName: 'photo',
		...partial
	};
}

function ref(source: string): ImageRef {
	const parsed = new ImageLinkParser().parse(source)[0];
	if (!parsed) {
		throw new Error('Expected image ref');
	}
	return parsed;
}

describe('UploadAction', () => {
	it('uploads and rewrites note link to public url', async () => {
		const note = new FakeNoteContent('![[photo.png]]');
		const storage = new FakeObjectStorage({ publicBaseUrl: 'https://cdn.example.com' });
		const vault = new FakeVaultBinary({ 'Journal/photo.png': new Uint8Array([1, 2, 3]) });
		const action = createAction();
		const result = await action.execute({
			ctx: ctx(),
			deleteSourceAfterUpload: false,
			hasRemainingReference: vi.fn().mockResolvedValue(false),
			linkStyle: 'wiki',
			localPath: 'Journal/photo.png',
			note,
			noteFolderPath: 'Journal',
			// eslint-disable-next-line no-template-curly-in-string -- name-template token syntax
			objectKeyTemplate: 'images/${originalName}.${ext}',
			ref: ref('![[photo.png]]'),
			storage,
			vault
		});
		expect(result.ok).toBe(true);
		expect(note.getContent()).toBe('![](https://cdn.example.com/images/photo.png)');
		expect(storage.uploadedKeys).toContain('images/photo.png');
	});

	it('fails when object key already exists', async () => {
		const note = new FakeNoteContent('![[photo.png]]');
		const storage = new FakeObjectStorage({
			existing: ['images/photo.png'],
			publicBaseUrl: 'https://cdn.example.com'
		});
		const vault = new FakeVaultBinary({ 'Journal/photo.png': new Uint8Array([1, 2, 3]) });
		const action = createAction();
		const result = await action.execute({
			ctx: ctx(),
			deleteSourceAfterUpload: false,
			hasRemainingReference: vi.fn().mockResolvedValue(false),
			linkStyle: 'wiki',
			localPath: 'Journal/photo.png',
			note,
			noteFolderPath: 'Journal',
			// eslint-disable-next-line no-template-curly-in-string -- name-template token syntax
			objectKeyTemplate: 'images/${originalName}.${ext}',
			ref: ref('![[photo.png]]'),
			storage,
			vault
		});
		expect(result).toEqual({ ok: false, reason: 'conflict' });
		expect(note.getContent()).toBe('![[photo.png]]');
		expect(storage.uploadedKeys).toHaveLength(0);
	});

	it('trashes local source when deleteSourceAfterUpload is true', async () => {
		const note = new FakeNoteContent('![[photo.png]]');
		const storage = new FakeObjectStorage({ publicBaseUrl: 'https://cdn.example.com' });
		const vault = new FakeVaultBinary({ 'Journal/photo.png': new Uint8Array([1, 2, 3]) });
		const action = createAction();
		const result = await action.execute({
			ctx: ctx(),
			deleteSourceAfterUpload: true,
			hasRemainingReference: vi.fn().mockResolvedValue(false),
			linkStyle: 'wiki',
			localPath: 'Journal/photo.png',
			note,
			noteFolderPath: 'Journal',
			// eslint-disable-next-line no-template-curly-in-string -- name-template token syntax
			objectKeyTemplate: 'images/${originalName}.${ext}',
			ref: ref('![[photo.png]]'),
			storage,
			vault
		});
		expect(result.ok).toBe(true);
		expect(vault.trashed).toContain('Journal/photo.png');
	});

	it('encodes spaces in public url path segments', async () => {
		const note = new FakeNoteContent('![[Pasted image.png]]');
		const storage = new FakeObjectStorage({ publicBaseUrl: 'https://cdn.example.com' });
		const vault = new FakeVaultBinary({
			'Journal/Pasted image.png': new Uint8Array([1, 2, 3])
		});
		const action = createAction();
		const result = await action.execute({
			ctx: ctx({ originalName: 'Pasted image' }),
			deleteSourceAfterUpload: false,
			hasRemainingReference: vi.fn().mockResolvedValue(false),
			linkStyle: 'wiki',
			localPath: 'Journal/Pasted image.png',
			note,
			noteFolderPath: 'Journal',
			// eslint-disable-next-line no-template-curly-in-string -- name-template token syntax
			objectKeyTemplate: 'images/${originalName}.${ext}',
			ref: ref('![[Pasted image.png]]'),
			storage,
			vault
		});
		expect(result.ok).toBe(true);
		expect(note.getContent()).toBe(
			'![](https://cdn.example.com/images/Pasted%20image.png)'
		);
		expect(storage.uploadedKeys).toContain('images/Pasted image.png');
	});

	it('rewrites only the selected repeated occurrence', async () => {
		const source = '![[photo.png]] then ![[photo.png]]';
		const selected = new ImageLinkParser().parse(source)[1];
		if (!selected) {
			throw new Error('Expected second image ref');
		}
		const note = new FakeNoteContent(source);
		const storage = new FakeObjectStorage({ publicBaseUrl: 'https://cdn.example.com' });
		const vault = new FakeVaultBinary({ 'Journal/photo.png': new Uint8Array([1]) });

		await createAction().execute({
			ctx: ctx(),
			deleteSourceAfterUpload: false,
			hasRemainingReference: vi.fn().mockResolvedValue(false),
			linkStyle: 'wiki',
			localPath: 'Journal/photo.png',
			note,
			noteFolderPath: 'Journal',
			// eslint-disable-next-line no-template-curly-in-string -- name-template token syntax
			objectKeyTemplate: 'images/${originalName}.${ext}',
			ref: selected,
			storage,
			vault
		});

		expect(note.getContent()).toBe(
			'![[photo.png]] then ![](https://cdn.example.com/images/photo.png)'
		);
	});

	it('does not trash a source still referenced by another occurrence', async () => {
		const source = '![[photo.png]] then ![[photo.png]]';
		const selected = new ImageLinkParser().parse(source)[1];
		if (!selected) {
			throw new Error('Expected second image ref');
		}
		const note = new FakeNoteContent(source);
		const storage = new FakeObjectStorage({ publicBaseUrl: 'https://cdn.example.com' });
		const vault = new FakeVaultBinary({ 'Journal/photo.png': new Uint8Array([1]) });

		await createAction().execute({
			ctx: ctx(),
			deleteSourceAfterUpload: true,
			hasRemainingReference: vi.fn().mockResolvedValue(true),
			linkStyle: 'wiki',
			localPath: 'Journal/photo.png',
			note,
			noteFolderPath: 'Journal',
			// eslint-disable-next-line no-template-curly-in-string -- name-template token syntax
			objectKeyTemplate: 'images/${originalName}.${ext}',
			ref: selected,
			storage,
			vault
		});

		expect(vault.trashed).not.toContain('Journal/photo.png');
	});
});
