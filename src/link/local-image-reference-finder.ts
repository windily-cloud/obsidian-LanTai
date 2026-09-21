import type {
	App,
	TFile
} from 'obsidian';

import type { ImageLinkParser } from './image-link-parser.ts';
import type { RemoteImageReference } from './remote-image-reference-finder.ts';

import { listLocalImageReferencePaths } from './has-local-image-reference.ts';

interface LocalImageReferenceFinderConstructorParams {
	readonly app: App;
	readonly parser: ImageLinkParser;
	resolvePath(target: string, noteFilePath: string): null | string;
}

export class LocalImageReferenceFinder {
	private readonly app: App;
	private readonly parser: ImageLinkParser;
	private readonly resolvePath: (target: string, noteFilePath: string) => null | string;

	public constructor(params: LocalImageReferenceFinderConstructorParams) {
		this.app = params.app;
		this.parser = params.parser;
		this.resolvePath = (target, noteFilePath): null | string => params.resolvePath(target, noteFilePath);
	}

	public async find(localPath: string): Promise<RemoteImageReference[]> {
		const notes = [];
		for (const file of this.app.vault.getMarkdownFiles()) {
			notes.push({
				content: await this.app.vault.cachedRead(file),
				path: file.path
			});
		}
		return listLocalImageReferencePaths({
			localPath,
			notes,
			parse: (content): ReturnType<ImageLinkParser['parse']> => this.parser.parse(content),
			resolvePath: this.resolvePath
		}).map((path) => {
			const file = this.app.vault.getAbstractFileByPath(path);
			return {
				path,
				title: isTFile(file) ? file.basename : path
			};
		});
	}
}

function isTFile(value: unknown): value is TFile {
	return value !== null && typeof value === 'object' && 'basename' in value && 'path' in value;
}
