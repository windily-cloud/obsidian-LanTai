import {
	describe,
	expect,
	it,
	vi
} from 'vitest';

import type { ImageRef } from '../../link/image-ref.ts';

import { FakeNoteContent } from '../../adapters/obsidian/tests/fake-note-content.ts';
import { FakeVaultBinary } from '../../adapters/obsidian/tests/fake-vault-binary.ts';
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
import { LocalImageUploadService } from '../local-image-upload-service.ts';
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

describe('ImageActionFacade.uploadAllLocalInNote', () => {
	it('uploads unique local files through LocalImageUploadService', async () => {
		const parser = new ImageLinkParser();
		const pathResolver = new AttachmentPathResolver(new NameTemplateEngine());
		const linkService = new ImageLinkService(parser, new ImageLinkFormatter());
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
		const storage = new FakeObjectStorage({ publicBaseUrl: 'https://cdn.example.com' });
		const note = new FakeNoteContent('see ![[photo.png]] and ![[photo.png]]');
		const vault = new FakeVaultBinary({ 'Journal/photo.png': new Uint8Array([1, 2, 3]) });
		const upload = new LocalImageUploadService({
			parser,
			resolveVaultPath: (target, noteFilePath): string => {
				const folder = noteFilePath.includes('/')
					? noteFilePath.slice(0, noteFilePath.lastIndexOf('/'))
					: '';
				return folder ? `${folder}/${target}` : target;
			},
			uploadAction: new UploadAction(pathResolver, linkService)
		});
		const spy = vi.spyOn(upload, 'uploadUniqueFile');
		const facade = new ImageActionFacade({
			confirmOverwrite: (): Promise<boolean> => Promise.resolve(false),
			createStorage: (): Promise<FakeObjectStorage> => Promise.resolve(storage),
			download: { save: vi.fn() },
			downloadAction: new DownloadAction(),
			getSecret: (name: string): string => (name === 'ak' ? 'access-key' : 'secret-key'),
			hasLocalReference: (): Promise<boolean> => Promise.resolve(false),
			http: { fetchBinary: vi.fn() },
			localImageUpload: upload,
			localizeAction: new LocalizeAction(pathResolver, linkService),
			parser,
			pathResolver,
			recordUpload: vi.fn().mockResolvedValue(undefined),
			resolveVaultPath: (target, noteFilePath): string => {
				const folder = noteFilePath.includes('/')
					? noteFilePath.slice(0, noteFilePath.lastIndexOf('/'))
					: '';
				return folder ? `${folder}/${target}` : target;
			},
			settings,
			vault
		});
		const results = await facade.uploadAllLocalInNote({
			note,
			noteFilePath: 'Journal/a.md'
		});
		expect(results.every((result) => result.ok)).toBe(true);
		expect(spy).toHaveBeenCalled();
		expect(storage.uploadedKeys).toEqual(['images/photo.png']);
		expect(note.getContent()).toBe(
			'see ![](https://cdn.example.com/images/photo.png) and ![](https://cdn.example.com/images/photo.png)'
		);
	});
});
