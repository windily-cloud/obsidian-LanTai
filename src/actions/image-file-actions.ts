import type { SystemImageClipboard } from '../adapters/desktop/system-image-clipboard.ts';
import type { HttpFetch } from '../adapters/obsidian/http-fetch.obsidian.ts';
import type { ImageTarget } from '../link/image-ref.ts';

export interface ImageFileActionsConstructorParams {
	getObsidianUrl(vaultPath: string): string;
	readonly http: HttpFetch;
	readonly imageClipboard: Pick<SystemImageClipboard, 'copy'>;
	modifyBinary(vaultPath: string, bytes: Uint8Array): Promise<void>;
	move(vaultPath: string): Promise<void>;
	openDefault(vaultPath: string): Promise<void>;
	openInNewTab(vaultPath: string): Promise<void>;
	openInNewTabGroup(vaultPath: string): Promise<void>;
	openInNewWindow(vaultPath: string): Promise<void>;
	pickReplacementBytes(): Promise<null | Uint8Array>;
	promptDelete(vaultPath: string): Promise<boolean>;
	readBinary(vaultPath: string): Promise<Uint8Array>;
	rename(vaultPath: string): Promise<void>;
	resolveVaultPath(target: string, noteFilePath: string): null | string;
	showInFileList(vaultPath: string): Promise<void>;
	showInFolder(vaultPath: string): Promise<void>;
	star(vaultPath: string): Promise<void>;
	toSystemPath(vaultPath: string): string;
	trash(vaultPath: string): Promise<void>;
	writeText(text: string): Promise<void>;
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
			this.params.imageClipboard.copy(bytes);
			return;
		}
		const vaultPath = this.resolveLocalPath(target, noteFilePath);
		const bytes = await this.params.readBinary(vaultPath);
		this.params.imageClipboard.copy(bytes);
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

	public async rename(target: ImageTarget, noteFilePath: string): Promise<void> {
		await this.params.rename(this.resolveLocalPath(target, noteFilePath));
	}

	public async replaceContent(target: ImageTarget, noteFilePath: string): Promise<boolean> {
		const vaultPath = this.resolveLocalPath(target, noteFilePath);
		const bytes = await this.params.pickReplacementBytes();
		if (!bytes) {
			return false;
		}
		await this.params.modifyBinary(vaultPath, bytes);
		return true;
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

	private resolveLocalPath(target: ImageTarget, noteFilePath: string): string {
		if (target.isRemote) {
			throw new Error('This action requires a local vault file.');
		}
		const path = this.params.resolveVaultPath(target.target, noteFilePath);
		if (!path) {
			throw new Error('Local image was not found.');
		}
		return path;
	}
}
