import type {
	App,
	TFile
} from 'obsidian';

import type { ImageLinkParser } from './image-link-parser.ts';

export interface RemoteImageReference {
	path: string;
	title: string;
}

interface RemoteImageReferenceFinderConstructorParams {
	readonly app: App;
	readonly parser: ImageLinkParser;
}

export class RemoteImageReferenceFinder {
	private readonly app: App;
	private readonly parser: ImageLinkParser;

	public constructor(params: RemoteImageReferenceFinderConstructorParams) {
		this.app = params.app;
		this.parser = params.parser;
	}

	public async find(publicUrl: string): Promise<RemoteImageReference[]> {
		const internalResults = await tryInternalSearch(this.app, publicUrl) ?? [];
		const expected = normalizeUrl(publicUrl);
		const references = new Map(internalResults.map((reference) => [reference.path, reference]));
		for (const file of this.app.vault.getMarkdownFiles()) {
			const content = await this.app.vault.cachedRead(file);
			if (
				containsExactUrl(content, publicUrl)
				|| this.parser.parse(content).some((ref) => ref.isRemote && normalizeUrl(ref.target) === expected)
			) {
				const reference = toReference(file);
				references.set(reference.path, reference);
			}
		}
		return [...references.values()];
	}
}

function containsExactUrl(content: string, publicUrl: string): boolean {
	let index = content.indexOf(publicUrl);
	while (index !== -1) {
		const next = content[index + publicUrl.length];
		if (next === undefined || /[\s)\]}>"']/.test(next)) {
			return true;
		}
		index = content.indexOf(publicUrl, index + publicUrl.length);
	}
	return false;
}

function isFunction(value: unknown): value is (...args: unknown[]) => unknown {
	return typeof value === 'function';
}

function isObject(value: unknown): value is object {
	return typeof value === 'object' && value !== null;
}

function normalizeUrl(value: string): string {
	try {
		return new URL(value).href;
	} catch {
		return value;
	}
}

function toInternalReference(value: unknown): null | RemoteImageReference {
	if (!isObject(value)) {
		return null;
	}
	const path = Reflect.get(value, 'path');
	const title = Reflect.get(value, 'title');
	return typeof path === 'string' && typeof title === 'string'
		? { path, title }
		: null;
}

function toReference(file: TFile): RemoteImageReference {
	return { path: file.path, title: file.basename };
}

async function tryInternalSearch(app: App, publicUrl: string): Promise<null | RemoteImageReference[]> {
	const internalPlugins = Reflect.get(app, 'internalPlugins');
	if (!isObject(internalPlugins)) {
		return null;
	}
	try {
		const getPluginById = Reflect.get(internalPlugins, 'getPluginById');
		if (!isFunction(getPluginById)) {
			return null;
		}
		const plugin = Reflect.apply(getPluginById, internalPlugins, ['global-search']);
		if (!isObject(plugin)) {
			return null;
		}
		const instance = Reflect.get(plugin, 'instance');
		if (!isObject(instance)) {
			return null;
		}
		const searchReferences = Reflect.get(instance, 'searchReferences');
		if (!isFunction(searchReferences)) {
			return null;
		}
		const result = await Reflect.apply(searchReferences, instance, [`"${publicUrl}"`]);
		if (!Array.isArray(result)) {
			return null;
		}
		const references = result.map(toInternalReference);
		return references.every((reference) => reference !== null)
			? references
			: null;
	} catch {
		return null;
	}
}
