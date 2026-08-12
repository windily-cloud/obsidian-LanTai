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
		for (const linkpath of linkpathCandidates(target)) {
			// Cspell:ignore linkpath -- Obsidian API method spelling.
			const file = this.app.metadataCache.getFirstLinkpathDest(linkpath, noteFilePath);
			if (file) {
				return file.path;
			}
		}
		return null;
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

function basename(path: string): string {
	const normalized = path.replace(/\\/g, '/');
	const withoutQuery = normalized.split('?')[0] ?? normalized;
	const parts = withoutQuery.split('/');
	return parts[parts.length - 1] ?? withoutQuery;
}

function decodeLinkTarget(target: string): string {
	try {
		return decodeURIComponent(target);
	} catch {
		return target;
	}
}

function linkpathCandidates(target: string): string[] {
	const decoded = decodeLinkTarget(target);
	const withoutProtocol = stripResourceProtocol(decoded);
	const fileName = basename(withoutProtocol);
	const candidates: string[] = [];
	if (fileName) {
		candidates.push(fileName);
	}
	const normalized = normalizePath(withoutProtocol);
	if (normalized && normalized !== fileName) {
		candidates.push(normalized);
	}
	return [...new Set(candidates)];
}

function stripResourceProtocol(target: string): string {
	const appProtocol = /^app:\/\/[^/]+\/[^/]+\/(?<resourcePath>.+)$/.exec(target);
	if (appProtocol?.groups?.['resourcePath']) {
		return appProtocol.groups['resourcePath'];
	}
	return target;
}

function toStandaloneArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength).slice().buffer;
}
