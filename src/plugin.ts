import { PluginBase } from 'obsidian-dev-utils/obsidian/plugin/plugin';

import { DownloadAction } from './actions/download-action.ts';
import { ImageActionFacade } from './actions/image-action-facade.ts';
import { ImageFileActions } from './actions/image-file-actions.ts';
import { LocalizeAction } from './actions/localize-action.ts';
import { UploadAction } from './actions/upload-action.ts';
import { SystemImageClipboard } from './adapters/desktop/system-image-clipboard.ts';
import { ObsidianDesktopFileActions } from './adapters/obsidian/desktop-file-actions.obsidian.ts';
import { ObsidianHttpFetch } from './adapters/obsidian/http-fetch.obsidian.ts';
import { SaveAttachmentPatchComponent } from './adapters/obsidian/save-attachment.obsidian.ts';
import { ObsidianSaveDialog } from './adapters/obsidian/save-dialog.obsidian.ts';
import { ObsidianSecretStore } from './adapters/obsidian/secret-store.obsidian.ts';
import { ObsidianVaultBinary } from './adapters/obsidian/vault-binary.obsidian.ts';
import { ImageLinkFormatter } from './link/image-link-formatter.ts';
import { ImageLinkParser } from './link/image-link-parser.ts';
import { ImageLinkService } from './link/image-link-service.ts';
import { RemoteImageReferenceFinder } from './link/remote-image-reference-finder.ts';
import { AttachmentPathResolver } from './path/attachment-path-resolver.ts';
import { NameTemplateEngine } from './path/name-template-engine.ts';
import {
	PluginSettings,
	PluginSettingsTab
} from './settings/plugin-settings.ts';
import { createObjectStorage } from './storage/object-storage-factory.ts';
import { CommandRegistrar } from './ui/command-registrar.ts';
import { ImageContextMenuController } from './ui/image-context-menu-controller.ts';
import { registerStorageGallery } from './ui/storage-gallery-registration.ts';

export class Plugin extends PluginBase {
	/** Bound by Obsidian declarative settings (`getControlValue` / `setControlValue`). */
	public override settings = new PluginSettings();

	protected override async onloadImpl(): Promise<void> {
		this.settings = Object.assign(new PluginSettings(), await this.loadData());

		const parser = new ImageLinkParser();
		const linkService = new ImageLinkService(parser, new ImageLinkFormatter());
		const pathResolver = new AttachmentPathResolver(new NameTemplateEngine());
		const vault = new ObsidianVaultBinary({ app: this.app });
		const http = new ObsidianHttpFetch();
		const desktop = new ObsidianDesktopFileActions(this.app);
		const secretStore = new ObsidianSecretStore({ app: this.app });
		const facade = new ImageActionFacade({
			createStorage: createObjectStorage,
			downloadAction: new DownloadAction(),
			getSecret: (name: string): null | string => secretStore.getSecret(name),
			hasLocalReference: async (localPath, context): Promise<boolean> => {
				for (const file of this.app.vault.getMarkdownFiles()) {
					const content = file.path === context.noteFilePath
						? context.note.getContent()
						: await this.app.vault.cachedRead(file);
					if (
						parser.parse(content).some(
							(ref) => !ref.isRemote && vault.resolvePath(ref.target, file.path) === localPath
						)
					) {
						return true;
					}
				}
				return false;
			},
			http,
			localizeAction: new LocalizeAction(pathResolver, linkService),
			parser,
			resolveVaultPath: (target: string, noteFilePath: string): null | string => vault.resolvePath(target, noteFilePath),
			saveDialog: new ObsidianSaveDialog(),
			settings: this.settings,
			uploadAction: new UploadAction(pathResolver, linkService),
			vault
		});

		this.addChild(
			new SaveAttachmentPatchComponent({
				app: this.app,
				pathResolver,
				settings: this.settings
			})
		);

		this.addSettingTab(
			new PluginSettingsTab({
				app: this.app,
				pathResolver,
				plugin: this,
				saveSettings: async (): Promise<void> => this.saveData(this.settings),
				settings: this.settings
			})
		);
		new CommandRegistrar({
			app: this.app,
			facade,
			linkService,
			plugin: this
		}).register();
		new ImageContextMenuController({
			app: this.app,
			facade,
			fileActions: new ImageFileActions({
				getObsidianUrl: (path: string): string => desktop.getObsidianUrl(path),
				http,
				imageClipboard: new SystemImageClipboard(),
				modifyBinary: (path: string, bytes: Uint8Array): Promise<void> => vault.modifyBinary(path, bytes),
				move: (path: string): Promise<void> => desktop.move(path),
				openDefault: (path: string): Promise<void> => desktop.openDefault(path),
				openInNewTab: (path: string): Promise<void> => desktop.openInNewTab(path),
				openInNewTabGroup: (path: string): Promise<void> => desktop.openInNewTabGroup(path),
				openInNewWindow: (path: string): Promise<void> => desktop.openInNewWindow(path),
				pickReplacementBytes: (): Promise<null | Uint8Array> => desktop.pickReplacementBytes(),
				promptDelete: (path: string): Promise<boolean> => desktop.promptDelete(path),
				readBinary: (path: string): Promise<Uint8Array> => vault.readBinary(path),
				rename: (path: string): Promise<void> => desktop.rename(path),
				resolveVaultPath: (target: string, noteFilePath: string): null | string => vault.resolvePath(target, noteFilePath),
				showInFileList: (path: string): Promise<void> => desktop.showInFileList(path),
				showInFolder: (path: string): Promise<void> => desktop.showInFolder(path),
				star: (path: string): Promise<void> => desktop.star(path),
				toSystemPath: (path: string): string => desktop.toSystemPath(path),
				trash: (path: string): Promise<void> => vault.trash(path),
				writeText: (text: string): Promise<void> => desktop.writeText(text)
			}),
			linkService,
			plugin: this
		}).register();
		registerStorageGallery({
			createStorage: createObjectStorage,
			findReferences: new RemoteImageReferenceFinder({ app: this.app, parser }),
			getSecret: (name: string): null | string => secretStore.getSecret(name),
			plugin: this,
			saveSettings: async (): Promise<void> => this.saveData(this.settings),
			settings: this.settings
		});
	}
}
