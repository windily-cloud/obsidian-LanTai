import type {
	App,
	TFile,
	Vault
} from 'obsidian';

import {
	describe,
	expect,
	it,
	vi
} from 'vitest';

import { ImageLinkParser } from '../image-link-parser.ts';
import { RemoteImageReferenceFinder } from '../remote-image-reference-finder.ts';

describe('RemoteImageReferenceFinder', () => {
	it('finds exact image links across Markdown notes', async () => {
		const catNote = file('Animals/Cats.md', 'Cats');
		const dogNote = file('Animals/Dogs.md', 'Dogs');
		const app = appWithFiles(
			new Map([
				[catNote, '![](https://cdn.example.com/images/cat.png)'],
				[dogNote, '![](https://cdn.example.com/images/cat.png-old)']
			])
		);
		const finder = new RemoteImageReferenceFinder({ app, parser: new ImageLinkParser() });

		await expect(finder.find('https://cdn.example.com/images/cat.png')).resolves.toEqual([
			{ path: 'Animals/Cats.md', title: 'Cats' }
		]);
	});

	it('falls back to vault search when the internal search result is unsupported', async () => {
		const note = file('Notes/Encoded.md', 'Encoded');
		const app = appWithFiles(
			new Map([
				[note, '![](https://cdn.example.com/images/cat%20photo.png)']
			])
		);
		Object.assign(app, {
			internalPlugins: {
				getPluginById: (): object => ({
					instance: { searchReferences: (): object => ({ unsupported: true }) }
				})
			}
		});
		const finder = new RemoteImageReferenceFinder({ app, parser: new ImageLinkParser() });

		await expect(finder.find('https://cdn.example.com/images/cat%20photo.png')).resolves.toEqual([
			{ path: 'Notes/Encoded.md', title: 'Encoded' }
		]);
	});

	it('does not trust an empty internal search result over vault contents', async () => {
		const note = file('Notes/Cats.md', 'Cats');
		const app = appWithFiles(
			new Map([
				[note, 'Referenced URL: https://cdn.example.com/images/cat.png']
			])
		);
		Object.assign(app, {
			internalPlugins: {
				getPluginById: (): object => ({
					instance: { searchReferences: (): unknown[] => [] }
				})
			}
		});
		const finder = new RemoteImageReferenceFinder({ app, parser: new ImageLinkParser() });

		await expect(finder.find('https://cdn.example.com/images/cat.png')).resolves.toEqual([
			{ path: 'Notes/Cats.md', title: 'Cats' }
		]);
	});
});

function appWithFiles(files: Map<TFile, string>): App {
	const app = Object.create(null) as App;
	app.vault = Object.assign(Object.create(null) as Vault, {
		cachedRead: vi.fn((fileToRead: TFile) => Promise.resolve(files.get(fileToRead) ?? '')),
		getMarkdownFiles: vi.fn(() => [...files.keys()])
	});
	return app;
}

function file(path: string, basename: string): TFile {
	const result = Object.create(null) as TFile;
	result.basename = basename;
	result.path = path;
	return result;
}
