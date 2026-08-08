import type {
	App,
	TFile
} from 'obsidian';

import {
	MarkdownView,
	normalizePath,
	Notice,
	TFile as ObsidianTFile
} from 'obsidian';
import { MonkeyAroundComponent } from 'obsidian-dev-utils/obsidian/components/monkey-around-component';

import type { AttachmentPathResolver } from '../../path/attachment-path-resolver.ts';
import type { PluginSettings } from '../../settings/plugin-settings.ts';

import { t } from '../../i18n/index.ts';
import { isImageExtension } from '../../path/image-extension.ts';
import { buildNameTemplateContext } from '../../path/name-template-context.ts';
import { nextAvailablePath } from '../../path/next-available-path.ts';
import { ensureParentFolders } from './ensure-parent-folders.ts';

interface SaveAttachmentPatchComponentConstructorParams {
	readonly app: App;
	readonly pathResolver: AttachmentPathResolver;
	readonly settings: PluginSettings;
}

interface SaveAttachmentPatchComponentHandleSaveAttachmentParams {
	readonly data: ArrayBuffer;
	readonly extension: string;
	fallback(): Promise<TFile>;
	readonly name: string;
}

export class SaveAttachmentPatchComponent extends MonkeyAroundComponent {
	private readonly hostApp: App;
	private readonly pathResolver: AttachmentPathResolver;
	private readonly settings: PluginSettings;

	public constructor(params: SaveAttachmentPatchComponentConstructorParams) {
		super();
		this.hostApp = params.app;
		this.pathResolver = params.pathResolver;
		this.settings = params.settings;
	}

	public override onload(): void {
		this.registerMethodPatch({
			methodName: 'saveAttachment',
			obj: this.hostApp,
			patchHandler: ({
				fallback,
				originalArgs: [name, extension, data]
			}) => {
				return this.handleSaveAttachment({
					data,
					extension,
					fallback,
					name
				});
			}
		});
	}

	private async handleSaveAttachment(
		params: SaveAttachmentPatchComponentHandleSaveAttachmentParams
	): Promise<TFile> {
		if (!isImageExtension(params.extension)) {
			return params.fallback();
		}

		const noteFile = this.hostApp.workspace.getActiveViewOfType(MarkdownView)?.file
			?? this.hostApp.workspace.getActiveFile();
		if (!noteFile || !(noteFile instanceof ObsidianTFile) || noteFile.extension !== 'md') {
			return params.fallback();
		}

		try {
			const preferred = this.pathResolver.resolveLocalPath({
				base: this.settings.attachmentBase,
				ctx: buildNameTemplateContext({
					ext: params.extension,
					noteFilePath: noteFile.path,
					originalName: params.name
				}),
				noteFolderPath: noteFile.parent?.path ?? '',
				template: this.settings.localPathTemplate
			});
			const uniquePath = nextAvailablePath(
				normalizePath(preferred),
				(path) => this.hostApp.vault.getAbstractFileByPath(path) !== null
			);
			await ensureParentFolders(this.hostApp, uniquePath);
			return await this.hostApp.vault.createBinary(uniquePath, params.data);
		} catch (error) {
			console.error(error);
			new Notice(t('settings.imageCreateFallback'));
			return params.fallback();
		}
	}
}
