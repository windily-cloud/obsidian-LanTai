import {
	describe,
	expect,
	it
} from 'vitest';

import type { ImageRef } from '../../link/image-ref.ts';
import type { NameTemplateContext } from '../../path/name-template-context.ts';

import { FakeHttpFetch } from '../../adapters/obsidian/tests/fake-http-fetch.ts';
import { FakeNoteContent } from '../../adapters/obsidian/tests/fake-note-content.ts';
import { FakeVaultBinary } from '../../adapters/obsidian/tests/fake-vault-binary.ts';
import { ImageLinkFormatter } from '../../link/image-link-formatter.ts';
import { ImageLinkParser } from '../../link/image-link-parser.ts';
import { ImageLinkService } from '../../link/image-link-service.ts';
import { AttachmentPathResolver } from '../../path/attachment-path-resolver.ts';
import { NameTemplateEngine } from '../../path/name-template-engine.ts';
import { LocalizeAction } from '../localize-action.ts';

function createAction(): LocalizeAction {
	return new LocalizeAction(
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

describe('LocalizeAction', () => {
	it('only rewrites link when local target path already exists', async () => {
		const note = new FakeNoteContent('![](https://cdn.example.com/a.png)');
		const vault = new FakeVaultBinary({ 'Journal/photo.png': new Uint8Array([9]) });
		const http = new FakeHttpFetch();
		const action = createAction();
		const result = await action.execute({
			attachmentBase: 'note',
			ctx: ctx(),
			http,
			linkStyle: 'wiki',
			// eslint-disable-next-line no-template-curly-in-string -- name-template token syntax
			localPathTemplate: '${originalName}.${ext}',
			note,
			noteFolderPath: 'Journal',
			ref: ref('![](https://cdn.example.com/a.png)'),
			remoteUrl: 'https://cdn.example.com/a.png',
			vault
		});
		expect(result.ok).toBe(true);
		expect(note.getContent()).toBe('![[Journal/photo.png]]');
		expect(http.calls).toHaveLength(0);
	});

	it('downloads and writes when local target path is missing', async () => {
		const note = new FakeNoteContent('![](https://cdn.example.com/a.png)');
		const vault = new FakeVaultBinary();
		const http = new FakeHttpFetch({
			responses: { 'https://cdn.example.com/a.png': new Uint8Array([4, 5]) }
		});
		const action = createAction();
		const result = await action.execute({
			attachmentBase: 'note',
			ctx: ctx(),
			http,
			linkStyle: 'wiki',
			// eslint-disable-next-line no-template-curly-in-string -- name-template token syntax
			localPathTemplate: '${originalName}.${ext}',
			note,
			noteFolderPath: 'Journal',
			ref: ref('![](https://cdn.example.com/a.png)'),
			remoteUrl: 'https://cdn.example.com/a.png',
			vault
		});
		expect(result.ok).toBe(true);
		expect(note.getContent()).toBe('![[Journal/photo.png]]');
		expect(http.calls).toEqual(['https://cdn.example.com/a.png']);
		expect(await vault.readBinary('Journal/photo.png')).toEqual(new Uint8Array([4, 5]));
	});
});
