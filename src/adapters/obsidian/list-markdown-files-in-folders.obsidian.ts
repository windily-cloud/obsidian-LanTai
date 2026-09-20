import type { App } from 'obsidian';

import {
	normalizePath,
	TFile,
	Vault
} from 'obsidian';

import {
	isAllFolders,
	isObsidianPath
} from '../../migration/migration-folders.ts';

/** Lists Markdown notes under the given folders via Obsidian's indexed vault tree. */
export function listMarkdownFilesInFolders(app: App, folders: readonly string[]): string[] {
	if (folders.some(isAllFolders)) {
		return uniqueMarkdownPaths(
			app.vault.getMarkdownFiles()
				.map((file) => file.path)
				.filter((path) => !isObsidianPath(path))
		);
	}
	const paths: string[] = [];
	const seen = new Set<string>();
	for (const folderPath of folders) {
		const folder = app.vault.getFolderByPath(normalizePath(folderPath));
		if (folder === null) {
			continue;
		}
		Vault.recurseChildren(folder, (child) => {
			if (!(child instanceof TFile) || child.extension !== 'md' || isObsidianPath(child.path)) {
				return;
			}
			if (seen.has(child.path)) {
				return;
			}
			seen.add(child.path);
			paths.push(child.path);
		});
	}
	return paths;
}

function uniqueMarkdownPaths(paths: readonly string[]): string[] {
	const seen = new Set<string>();
	const unique: string[] = [];
	for (const path of paths) {
		if (seen.has(path)) {
			continue;
		}
		seen.add(path);
		unique.push(path);
	}
	return unique;
}
