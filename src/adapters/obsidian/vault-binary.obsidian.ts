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

	/**
	 * 解析链接指向的库内文件。
	 *
	 * target 含路径分隔符时**只做精确解析**（笔记相对 → 库根相对），不再退回
	 * `getFirstLinkpathDest` 的按文件名模糊匹配：该匹配对扩展名不敏感，且同名文件位于
	 * 不同目录时返回值取决于库内顺序，会把「链接里已写明完整路径」的引用解析到别的文件，
	 * 进而造成上传内容与对象键错配、跨笔记改写链接。仅当 target 是裸文件名（wiki 风格）
	 * 时才沿用 Obsidian 的 name-based 解析语义。
	 */
	public resolvePath(target: string, noteFilePath: string): null | string {
		const exactPaths = pathCandidates(target, noteFilePath);
		if (exactPaths.length > 0) {
			return this.findByPath(exactPaths);
		}
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

	private findByPath(paths: readonly string[]): null | string {
		for (const path of paths) {
			const file = this.app.vault.getFileByPath(path);
			if (file) {
				return file.path;
			}
		}
		// 精确路径全部落空时才容忍大小写差异：Obsidian 的链接解析本身大小写不敏感，
		// 这里保持同一语义，避免正常链接被误判为未解析。仍然要求**完整路径**匹配，
		// 因此不会退化成按文件名猜测。
		const byLowerCasedPath = new Map<string, string>();
		for (const file of this.app.vault.getFiles()) {
			const key = file.path.toLowerCase();
			if (!byLowerCasedPath.has(key)) {
				byLowerCasedPath.set(key, file.path);
			}
		}
		for (const path of paths) {
			const matched = byLowerCasedPath.get(path.toLowerCase());
			if (matched !== undefined) {
				return matched;
			}
		}
		return null;
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

function folderOfNote(noteFilePath: string): string {
	const normalized = noteFilePath.replace(/\\/g, '/');
	const index = normalized.lastIndexOf('/');
	return index === -1 ? '' : normalized.slice(0, index);
}

function isPathBearing(target: string): boolean {
	return target.includes('/');
}

/** 拼接库内路径并折叠 `.` / `..`，越出库根时按库根截断。 */
function joinVaultPath(folder: string, relative: string): string {
	const segments: string[] = [];
	for (const segment of folder.split('/')) {
		if (segment !== '' && segment !== '.') {
			segments.push(segment);
		}
	}
	for (const segment of relative.split('/')) {
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

function linkpathCandidates(target: string): string[] {
	const candidates: string[] = [];
	for (const variant of targetVariants(target)) {
		const withoutProtocol = stripResourceProtocol(variant);
		const fileName = basename(withoutProtocol);
		if (fileName) {
			candidates.push(fileName);
		}
		const normalized = normalizePath(withoutProtocol);
		if (normalized !== '' && normalized !== fileName) {
			candidates.push(normalized);
		}
	}
	return [...new Set(candidates)];
}

/**
 * 含路径分隔符的 target 对应的候选库内路径，按解析优先级排序：笔记相对路径 → 库根相对路径，
 * 每种都先试原始写法、再试解码后的写法。裸文件名返回空数组，交给 Obsidian 的 name-based 解析。
 */
function pathCandidates(target: string, noteFilePath: string): string[] {
	const noteFolder = folderOfNote(noteFilePath);
	const candidates: string[] = [];
	for (const variant of targetVariants(target)) {
		const withoutProtocol = stripResourceProtocol(variant);
		const withoutQuery = withoutProtocol.split(/[?#]/u, 1)[0] ?? withoutProtocol;
		if (!isPathBearing(withoutQuery)) {
			continue;
		}
		if (withoutQuery.startsWith('/')) {
			candidates.push(normalizePath(withoutQuery));
			continue;
		}
		candidates.push(normalizePath(joinVaultPath(noteFolder, withoutQuery)));
		candidates.push(normalizePath(withoutQuery));
	}
	return [...new Set(candidates)].filter((path) => path !== '');
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
