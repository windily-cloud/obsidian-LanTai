import type {
	App,
	TFile
} from 'obsidian';

import { normalizePath } from 'obsidian';

import { t } from '../../i18n/index.ts';
import { isImageExtension } from '../../path/image-extension.ts';

export interface VaultImage {
	mtime: number;
	name: string;
	path: string;
	size: number;
}

export interface VaultImageBrowser {
	listImages(): VaultImage[];
	resourceUrl(path: string): string;
	trash(path: string): Promise<void>;
}

interface ObsidianVaultImageBrowserConstructorParams {
	readonly app: App;
}

export class ObsidianVaultImageBrowser implements VaultImageBrowser {
	private readonly app: App;

	public constructor(params: ObsidianVaultImageBrowserConstructorParams) {
		this.app = params.app;
	}

	public listImages(): VaultImage[] {
		return this.app.vault
			.getFiles()
			.filter((file) => isImageExtension(file.extension))
			.map(toVaultImage)
			.sort((left, right) => right.mtime - left.mtime);
	}

	public resourceUrl(path: string): string {
		const file = this.getFile(path);
		return this.app.vault.getResourcePath(file);
	}

	public async trash(path: string): Promise<void> {
		await this.app.fileManager.trashFile(this.getFile(path));
	}

	private getFile(path: string): TFile {
		const file = this.app.vault.getFileByPath(normalizePath(path));
		if (!file) {
			throw new Error(t('errors.vaultFileNotFound', { path }));
		}
		return file;
	}
}

function toVaultImage(file: TFile): VaultImage {
	return {
		mtime: file.stat.mtime,
		name: file.name,
		path: file.path,
		size: file.stat.size
	};
}
