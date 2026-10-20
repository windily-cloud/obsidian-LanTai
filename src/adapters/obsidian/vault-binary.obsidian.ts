import type { App } from 'obsidian';

import { normalizePath } from 'obsidian';

import { t } from '../../i18n/index.ts';
import { ensureParentFolders } from './ensure-parent-folders.ts';

export interface VaultBinary {
	exists(path: string): Promise<boolean>;
	modifyBinary(path: string, bytes: Uint8Array): Promise<void>;
	readBinary(path: string): Promise<Uint8Array>;
	trash(path: string): Promise<void>;
	writeBinary(path: string, bytes: Uint8Array): Promise<void>;
}

interface ObsidianVaultBinaryConstructorParams {
	readonly app: App;
}

export class ObsidianVaultBinary implements VaultBinary {
	private readonly app: App;

	public constructor(params: ObsidianVaultBinaryConstructorParams) {
		this.app = params.app;
	}

	public exists(path: string): Promise<boolean> {
		return Promise.resolve(this.app.vault.getFileByPath(normalizePath(path)) !== null);
	}

	public async modifyBinary(path: string, bytes: Uint8Array): Promise<void> {
		const file = this.app.vault.getFileByPath(normalizePath(path));
		if (!file) {
			throw new Error(t('errors.vaultFileNotFound', { path }));
		}
		await this.app.vault.modifyBinary(file, toStandaloneArrayBuffer(bytes));
	}

	public async readBinary(path: string): Promise<Uint8Array> {
		const file = this.app.vault.getFileByPath(normalizePath(path));
		if (!file) {
			throw new Error(t('errors.vaultFileNotFound', { path }));
		}
		return new Uint8Array(await this.app.vault.readBinary(file));
	}

	public resolvePath(target: string, noteFilePath: string): null | string {
		const resourcePath = isResourceUrl(target) ? stripResourceProtocol(target) : null;
		const linkTarget = resourcePath ?? target;
		const variants = targetVariants(linkTarget);
		const rootRelative = resourcePath !== null || startsWithSeparator(linkTarget);

		if (!rootRelative && !hasPathSeparator(linkTarget)) {
			for (const variant of variants) {
				// Cspell:ignore linkpath -- Obsidian API method spelling.
				const file = this.app.metadataCache.getFirstLinkpathDest(variant, noteFilePath);
				if (file) {
					return file.path;
				}
			}
			return null;
		}

		const candidates = pathCandidates(
			variants,
			rootRelative ? '' : folderOf(noteFilePath),
			rootRelative
		);
		for (const candidate of candidates) {
			const file = this.app.vault.getFileByPath(normalizePath(candidate));
			if (file) {
				return file.path;
			}
		}
		const lowerCaseCandidates = new Set(candidates.map((candidate) => candidate.toLowerCase()));
		const caseInsensitive = this.app.vault.getFiles()
			.find((file) => lowerCaseCandidates.has(file.path.toLowerCase()));
		return caseInsensitive?.path ?? null;
	}

	public async trash(path: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
		if (!file) {
			throw new Error(t('errors.vaultFileNotFound', { path }));
		}
		await this.app.fileManager.trashFile(file);
	}

	public async writeBinary(path: string, bytes: Uint8Array): Promise<void> {
		const normalizedPath = normalizePath(path);
		if (this.app.vault.getAbstractFileByPath(normalizedPath)) {
			throw new Error(t('errors.vaultPathAlreadyExists', { path: normalizedPath }));
		}
		await ensureParentFolders(this.app, normalizedPath);
		await this.app.vault.createBinary(
			normalizedPath,
			toStandaloneArrayBuffer(bytes)
		);
	}
}

function decodeLinkTarget(target: string): string {
	try {
		return decodeURIComponent(target);
	} catch {
		return target;
	}
}

function folderOf(path: string): string {
	const normalized = path.replaceAll('\\', '/');
	const slashIndex = normalized.lastIndexOf('/');
	return slashIndex === -1 ? '' : normalized.slice(0, slashIndex);
}

function hasPathSeparator(target: string): boolean {
	return /[\\/]/u.test(target);
}

function isResourceUrl(target: string): boolean {
	return /^app:\/\//iu.test(target);
}

function joinVaultPath(baseFolder: string, target: string): string {
	const segments = baseFolder === '' ? [] : baseFolder.split('/');
	for (const segment of target.replaceAll('\\', '/').split('/')) {
		if (segment === '' || segment === '.') {
			continue;
		}
		if (segment === '..') {
			segments.pop();
			continue;
		}
		segments.push(segment);
	}
	return segments.join('/');
}

function pathCandidates(
	variants: readonly string[],
	noteFolder: string,
	rootRelative: boolean
): string[] {
	const candidates: string[] = [];
	for (const variant of variants) {
		const path = variant.replace(/^[\\/]+/u, '');
		if (!rootRelative) {
			const relative = joinVaultPath(noteFolder, path);
			if (relative !== '') {
				candidates.push(relative);
			}
		}
		const root = joinVaultPath('', path);
		if (root !== '') {
			candidates.push(root);
		}
	}
	return [...new Set(candidates)];
}

function startsWithSeparator(target: string): boolean {
	return /^[\\/]/u.test(target);
}

function stripResourceProtocol(target: string): string {
	const appProtocol = /^app:\/\/[^/]+\/[^/]+\/(?<resourcePath>.+)$/.exec(target);
	if (appProtocol?.groups?.['resourcePath']) {
		return appProtocol.groups['resourcePath'];
	}
	return target;
}

function targetVariants(target: string): string[] {
	const decoded = decodeLinkTarget(target);
	return decoded === target ? [target] : [target, decoded];
}

function toStandaloneArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength).slice().buffer;
}
