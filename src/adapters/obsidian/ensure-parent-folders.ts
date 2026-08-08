import type { App } from 'obsidian';

import { normalizePath } from 'obsidian';

/** Ensures parent folders of a vault file path exist using public `createFolder`. */
export async function ensureParentFolders(app: App, filePath: string): Promise<void> {
	const normalizedPath = normalizePath(filePath);
	const segments = normalizedPath.split('/');
	segments.pop();
	let current = '';
	for (const segment of segments) {
		current = current ? `${current}/${segment}` : segment;
		if (!app.vault.getAbstractFileByPath(current)) {
			await app.vault.createFolder(current);
		}
	}
}
