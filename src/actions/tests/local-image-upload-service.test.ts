import {
	describe,
	expect,
	it,
	vi
} from 'vitest';

import { FakeNoteContent } from '../../adapters/obsidian/tests/fake-note-content.ts';
import { FakeVaultBinary } from '../../adapters/obsidian/tests/fake-vault-binary.ts';
import { ImageLinkFormatter } from '../../link/image-link-formatter.ts';
import { ImageLinkParser } from '../../link/image-link-parser.ts';
import { ImageLinkService } from '../../link/image-link-service.ts';
import { AttachmentPathResolver } from '../../path/attachment-path-resolver.ts';
import { NameTemplateEngine } from '../../path/name-template-engine.ts';
import { FakeObjectStorage } from '../../storage/tests/fake-object-storage.ts';
import { LocalImageUploadService } from '../local-image-upload-service.ts';
import { UploadAction } from '../upload-action.ts';

// eslint-disable-next-line no-template-curly-in-string -- name-template token syntax
const OBJECT_KEY_TEMPLATE = 'images/${originalName}.${ext}';

function createService(): LocalImageUploadService {
	const parser = new ImageLinkParser();
	return new LocalImageUploadService({
		parser,
		resolveVaultPath: (target, noteFilePath): string => {
			const folder = noteFilePath.includes('/')
				? noteFilePath.slice(0, noteFilePath.lastIndexOf('/'))
				: '';
			return folder ? `${folder}/${target}` : target;
		},
		uploadAction: new UploadAction(
			new AttachmentPathResolver(new NameTemplateEngine()),
			new ImageLinkService(parser, new ImageLinkFormatter())
		)
	});
}

describe('LocalImageUploadService', () => {
	it('uploads a unique file once and rewrites every matching ref', async () => {
		const noteA = new FakeNoteContent('see ![[photo.png]]');
		const noteB = new FakeNoteContent('also ![[photo.png]]');
		const storage = new FakeObjectStorage({ publicBaseUrl: 'https://cdn.example.com' });
		const vault = new FakeVaultBinary({ 'Journal/photo.png': new Uint8Array([1, 2, 3]) });
		const recordUpload = vi.fn().mockResolvedValue(undefined);
		const onUploaded = vi.fn().mockResolvedValue(undefined);
		const result = await createService().uploadUniqueFile({
			deleteSourceAfterUpload: false,
			hasRemainingReference: vi.fn().mockResolvedValue(false),
			linkStyle: 'wiki',
			localPath: 'Journal/photo.png',
			objectKeyTemplate: OBJECT_KEY_TEMPLATE,
			onUploaded,
			profileId: 'p1',
			recordUpload,
			storage,
			targets: [
				{ note: noteA, noteFilePath: 'Journal/a.md', source: '![[photo.png]]' },
				{ note: noteB, noteFilePath: 'Journal/b.md', source: '![[photo.png]]' }
			],
			vault,
			writeMode: 'upload'
		});
		expect(result.ok).toBe(true);
		expect(storage.uploadedKeys).toEqual(['images/photo.png']);
		expect(onUploaded).toHaveBeenCalledWith({
			key: 'images/photo.png',
			url: 'https://cdn.example.com/images/photo.png'
		});
		expect(noteA.getContent()).toBe('see ![](https://cdn.example.com/images/photo.png)');
		expect(noteB.getContent()).toBe('also ![](https://cdn.example.com/images/photo.png)');
	});

	it('does not re-upload when knownUpload is provided', async () => {
		const note = new FakeNoteContent('![[photo.png]]');
		const storage = new FakeObjectStorage({
			clientKeyed: false,
			publicBaseUrl: 'https://cdn.lantai.pkmer.cn',
			uploadedObject: {
				key: '1758.webp',
				url: 'https://cdn.lantai.pkmer.cn/u1/1758.webp'
			}
		});
		const vault = new FakeVaultBinary({ 'Journal/photo.png': new Uint8Array([1]) });
		const result = await createService().uploadUniqueFile({
			deleteSourceAfterUpload: false,
			hasRemainingReference: vi.fn().mockResolvedValue(false),
			knownUpload: {
				key: '1758.webp',
				url: 'https://cdn.lantai.pkmer.cn/u1/1758.webp'
			},
			linkStyle: 'wiki',
			localPath: 'Journal/photo.png',
			objectKeyTemplate: OBJECT_KEY_TEMPLATE,
			profileId: 'lantai',
			recordUpload: vi.fn().mockResolvedValue(undefined),
			storage,
			targets: [{ note, noteFilePath: 'Journal/a.md', source: '![[photo.png]]' }],
			vault,
			writeMode: 'upload'
		});
		expect(result.ok).toBe(true);
		expect(storage.uploadedKeys).toHaveLength(0);
		expect(note.getContent()).toBe('![](https://cdn.lantai.pkmer.cn/u1/1758.webp)');
	});

	it('fails a changed ref without deleting the local file', async () => {
		const note = new FakeNoteContent('changed');
		const vault = new FakeVaultBinary({ 'Journal/photo.png': new Uint8Array([1]) });
		const result = await createService().uploadUniqueFile({
			deleteSourceAfterUpload: true,
			hasRemainingReference: vi.fn().mockResolvedValue(false),
			knownUpload: {
				key: 'images/photo.png',
				url: 'https://cdn.example.com/images/photo.png'
			},
			linkStyle: 'wiki',
			localPath: 'Journal/photo.png',
			objectKeyTemplate: OBJECT_KEY_TEMPLATE,
			profileId: 'p1',
			recordUpload: vi.fn().mockResolvedValue(undefined),
			storage: new FakeObjectStorage({ publicBaseUrl: 'https://cdn.example.com' }),
			targets: [{ note, noteFilePath: 'Journal/a.md', source: '![[photo.png]]' }],
			vault,
			writeMode: 'linkOnly'
		});
		expect(result.ok).toBe(false);
		expect(note.getContent()).toBe('changed');
		expect(vault.trashed).toHaveLength(0);
	});
});
