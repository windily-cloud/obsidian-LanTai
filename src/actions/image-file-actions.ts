import type { HttpFetch } from '../adapters/obsidian/http-fetch.obsidian.ts';
import type { ImageTarget } from '../link/image-ref.ts';

import { t } from '../i18n/index.ts';
import { nextAvailablePath } from '../path/next-available-path.ts';

export interface ReplaceImageResult {
	readonly newPath: string;
	readonly originalPath: string;
}

interface ImageClipboard {
	copy(bytes: Uint8Array): Promise<void> | void;
}

interface ImageFileActionsConstructorParams {
	fileExists(vaultPath: string): boolean;
	getObsidianUrl(vaultPath: string): string;
	readonly http: HttpFetch;
	readonly imageClipboard: ImageClipboard;
	modifyBinary(vaultPath: string, bytes: Uint8Array): Promise<void>;
	move(vaultPath: string): Promise<void>;
	openDefault(vaultPath: string): Promise<void>;
	openInCurrentTab(vaultPath: string): Promise<void>;
	openInNewTab(vaultPath: string): Promise<void>;
	openInNewTabGroup(vaultPath: string): Promise<void>;
	openInNewWindow(vaultPath: string): Promise<void>;
	openUrl(url: string): Promise<void>;
	pickReplacementBytes(): Promise<null | PickedImageFile>;
	promptDelete(vaultPath: string): Promise<boolean>;
	readBinary(vaultPath: string): Promise<Uint8Array>;
	rename(vaultPath: string): Promise<void>;
	resolveVaultPath(target: string, noteFilePath: string): null | string;
	shareFile(input: ShareFileInput): Promise<void>;
	shareUrl(url: string): Promise<void>;
	showInFileList(vaultPath: string): Promise<void>;
	showInFolder(vaultPath: string): Promise<void>;
	star(vaultPath: string): Promise<void>;
	toSystemPath(vaultPath: string): string;
	trash(vaultPath: string): Promise<void>;
	writeBinary(vaultPath: string, bytes: Uint8Array): Promise<void>;
	writeText(text: string): Promise<void>;
}

interface ImageFileActionsReplaceContentOptions {
	readonly retarget?: boolean;
}

interface PickedImageFile {
	readonly bytes: Uint8Array;
	readonly name: string;
}

interface ShareFileInput {
	readonly bytes: Uint8Array;
	readonly name: string;
}

export class ImageFileActions {
	private readonly params: ImageFileActionsConstructorParams;

	public constructor(params: ImageFileActionsConstructorParams) {
		this.params = params;
	}

	public async copyAbsolutePath(target: ImageTarget, noteFilePath: string): Promise<void> {
		const vaultPath = this.resolveLocalPath(target, noteFilePath);
		await this.params.writeText(this.params.toSystemPath(vaultPath));
	}

	public async copyImage(target: ImageTarget, noteFilePath: string): Promise<void> {
		if (target.isRemote) {
			const bytes = await this.params.http.fetchBinary(target.target);
			await this.params.imageClipboard.copy(bytes);
			return;
		}
		const vaultPath = this.resolveLocalPath(target, noteFilePath);
		const bytes = await this.params.readBinary(vaultPath);
		await this.params.imageClipboard.copy(bytes);
	}

	public async copyObsidianUrl(target: ImageTarget, noteFilePath: string): Promise<void> {
		const vaultPath = this.resolveLocalPath(target, noteFilePath);
		await this.params.writeText(this.params.getObsidianUrl(vaultPath));
	}

	public async copyVaultPath(target: ImageTarget, noteFilePath: string): Promise<void> {
		await this.params.writeText(this.resolveLocalPath(target, noteFilePath));
	}

	public async deleteFile(target: ImageTarget, noteFilePath: string): Promise<boolean> {
		const vaultPath = this.resolveLocalPath(target, noteFilePath);
		if (!(await this.params.promptDelete(vaultPath))) {
			return false;
		}
		await this.params.trash(vaultPath);
		return true;
	}

	public async move(target: ImageTarget, noteFilePath: string): Promise<void> {
		await this.params.move(this.resolveLocalPath(target, noteFilePath));
	}

	public async open(target: ImageTarget, noteFilePath: string): Promise<void> {
		await this.params.openDefault(this.resolveLocalPath(target, noteFilePath));
	}

	public async openInNewTab(target: ImageTarget, noteFilePath: string): Promise<void> {
		await this.params.openInNewTab(this.resolveLocalPath(target, noteFilePath));
	}

	public async openInNewTabGroup(target: ImageTarget, noteFilePath: string): Promise<void> {
		await this.params.openInNewTabGroup(this.resolveLocalPath(target, noteFilePath));
	}

	public async openInNewWindow(target: ImageTarget, noteFilePath: string): Promise<void> {
		await this.params.openInNewWindow(this.resolveLocalPath(target, noteFilePath));
	}

	public async openLink(target: ImageTarget, noteFilePath: string): Promise<void> {
		if (target.isRemote) {
			await this.params.openUrl(target.target);
			return;
		}
		await this.params.openInCurrentTab(this.resolveLocalPath(target, noteFilePath));
	}

	public async rename(target: ImageTarget, noteFilePath: string): Promise<void> {
		await this.params.rename(this.resolveLocalPath(target, noteFilePath));
	}

	public async replaceContent(
		target: ImageTarget,
		noteFilePath: string,
		options?: ImageFileActionsReplaceContentOptions
	): Promise<null | ReplaceImageResult> {
		const originalPath = this.resolveLocalPath(target, noteFilePath);
		const picked = await this.params.pickReplacementBytes();
		if (!picked || picked.bytes.byteLength === 0) {
			return null;
		}
		if (options?.retarget === true) {
			const preferred = siblingPath(originalPath, picked.name);
			const newPath = nextAvailablePath(preferred, (path) => this.params.fileExists(path));
			await this.params.writeBinary(newPath, picked.bytes);
			return { newPath, originalPath };
		}
		await this.params.modifyBinary(originalPath, picked.bytes);
		return { newPath: originalPath, originalPath };
	}

	public async share(target: ImageTarget, noteFilePath: string): Promise<void> {
		if (target.isRemote) {
			await this.params.shareUrl(target.target);
			return;
		}
		const vaultPath = this.resolveLocalPath(target, noteFilePath);
		const bytes = await this.params.readBinary(vaultPath);
		await this.params.shareFile({
			bytes,
			name: vaultPath.split('/').pop() ?? vaultPath
		});
	}

	public async showInFileList(target: ImageTarget, noteFilePath: string): Promise<void> {
		await this.params.showInFileList(this.resolveLocalPath(target, noteFilePath));
	}

	public async showInFolder(target: ImageTarget, noteFilePath: string): Promise<void> {
		await this.params.showInFolder(this.resolveLocalPath(target, noteFilePath));
	}

	public async star(target: ImageTarget, noteFilePath: string): Promise<void> {
		await this.params.star(this.resolveLocalPath(target, noteFilePath));
	}

	public async trashPath(vaultPath: string): Promise<void> {
		await this.params.trash(vaultPath);
	}

	private resolveLocalPath(target: ImageTarget, noteFilePath: string): string {
		if (target.isRemote) {
			throw new Error(t('errors.requiresLocalVaultFile'));
		}
		const path = this.params.resolveVaultPath(target.target, noteFilePath);
		if (!path) {
			throw new Error(t('errors.localImageNotFoundPeriod'));
		}
		return path;
	}
}

function siblingPath(originalPath: string, fileName: string): string {
	const slash = originalPath.lastIndexOf('/');
	const parent = slash === -1 ? '' : originalPath.slice(0, slash);
	const base = (fileName.split('/').pop() ?? fileName).trim() || 'image.png';
	return parent === '' ? base : `${parent}/${base}`;
}
