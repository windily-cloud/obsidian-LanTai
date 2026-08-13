import {
	normalizePath,
	Notice,
	Platform,
	requestUrl
} from 'obsidian';
import { PluginBase } from 'obsidian-dev-utils/obsidian/plugin/plugin';

import type { PickedImageFile } from './adapters/obsidian/pick-image-file-bytes.obsidian.ts';

import { DownloadAction } from './actions/download-action.ts';
import { ImageActionFacade } from './actions/image-action-facade.ts';
import { ImageFileActions } from './actions/image-file-actions.ts';
import { LocalizeAction } from './actions/localize-action.ts';
import { UploadAction } from './actions/upload-action.ts';
import { SystemImageClipboard } from './adapters/desktop/system-image-clipboard.ts';
import { ObsidianBrowserDownload } from './adapters/obsidian/browser-download.obsidian.ts';
import { ObsidianDesktopFileActions } from './adapters/obsidian/desktop-file-actions.obsidian.ts';
import { ObsidianHttpFetch } from './adapters/obsidian/http-fetch.obsidian.ts';
import { pickImageFileBytes } from './adapters/obsidian/pick-image-file-bytes.obsidian.ts';
import { SaveAttachmentPatchComponent } from './adapters/obsidian/save-attachment.obsidian.ts';
import { ObsidianSecretStore } from './adapters/obsidian/secret-store.obsidian.ts';
import { ObsidianUploadHistoryStore } from './adapters/obsidian/upload-history.obsidian.ts';
import { VaultAttachmentDownload } from './adapters/obsidian/vault-attachment-download.obsidian.ts';
import { ObsidianVaultBinary } from './adapters/obsidian/vault-binary.obsidian.ts';
import { ObsidianVaultImageBrowser } from './adapters/obsidian/vault-image-browser.obsidian.ts';
import { WebImageClipboard } from './adapters/web/web-image-clipboard.ts';
import { WebImageShare } from './adapters/web/web-image-share.ts';
import { t } from './i18n/index.ts';
import { ImageLinkFormatter } from './link/image-link-formatter.ts';
import { ImageLinkParser } from './link/image-link-parser.ts';
import { ImageLinkService } from './link/image-link-service.ts';
import { RemoteImageReferenceFinder } from './link/remote-image-reference-finder.ts';
import { AttachmentPathResolver } from './path/attachment-path-resolver.ts';
import { buildNameTemplateContext } from './path/name-template-context.ts';
import { NameTemplateEngine } from './path/name-template-engine.ts';
import {
	PluginSettings,
	PluginSettingsTab
} from './settings/plugin-settings.ts';
import { createGallerySource } from './storage/gallery-source-factory.ts';
import { createObjectStorageFactory } from './storage/object-storage-factory.ts';
import { RequestUrlObjectStorageTransport } from './storage/request-url-object-storage-transport.ts';
import { CommandRegistrar } from './ui/command-registrar.ts';
import { pickAndUploadGalleryImages } from './ui/gallery-uploader.ts';
import { ImageContextMenuController } from './ui/image-context-menu-controller.ts';
import { confirmOverwriteImages } from './ui/overwrite-confirm-modal.ts';
import { registerStorageGallery } from './ui/storage-gallery-registration.ts';

interface LegacySettingsFields {
	galleryUploadKeyTemplate?: string;
}

export class Plugin extends PluginBase {
	/** Bound by Obsidian declarative settings (`getControlValue` / `setControlValue`). */
	public override settings = new PluginSettings();

	protected override async onloadImpl(): Promise<void> {
		this.settings = Object.assign(new PluginSettings(), await this.loadData());
		delete (this.settings as LegacySettingsFields).galleryUploadKeyTemplate;
		const gallerySource = this.settings.gallerySource as string;
		if (gallerySource !== 'recent' && gallerySource !== 'bucket' && gallerySource !== 'vault') {
			this.settings.gallerySource = 'recent';
		}

		const parser = new ImageLinkParser();
		const linkService = new ImageLinkService(parser, new ImageLinkFormatter());
		const pathResolver = new AttachmentPathResolver(new NameTemplateEngine());
		const vault = new ObsidianVaultBinary({ app: this.app });
		const http = new ObsidianHttpFetch();
		const desktop = new ObsidianDesktopFileActions(this.app);
		const webShare = new WebImageShare();
		const imageClipboard = Platform.isMobile
			? new WebImageClipboard()
			: new SystemImageClipboard();
		const secretStore = new ObsidianSecretStore({ app: this.app });
		const uploadHistory = new ObsidianUploadHistoryStore({ app: this.app });
		const vaultImages = new ObsidianVaultImageBrowser({ app: this.app });
		const createObjectStorage = createObjectStorageFactory(
			new RequestUrlObjectStorageTransport({ requestUrl })
		);
		const download = Platform.isMobile
			? new VaultAttachmentDownload({
				exists: (path): Promise<boolean> => vault.exists(path),
				notify: (path): void => {
					new Notice(t('notices.downloadSavedToVault', { path }));
				},
				resolveDestination: (fileName): string => {
					const active = this.app.workspace.getActiveFile();
					const noteFilePath = active?.path ?? 'note.md';
					const dot = fileName.lastIndexOf('.');
					const originalName = dot === -1 ? fileName : fileName.slice(0, dot);
					const ext = dot === -1 ? '' : fileName.slice(dot + 1);
					const useNoteBase = this.settings.attachmentBase === 'note' && active !== null;
					return pathResolver.resolveLocalPath({
						base: useNoteBase ? 'note' : 'vault',
						ctx: buildNameTemplateContext({
							ext,
							noteFilePath,
							originalName
						}),
						noteFolderPath: useNoteBase
							? (active.parent?.path ?? '')
							: '',
						template: this.settings.localPathTemplate
					});
				},
				writeBinary: (path, bytes): Promise<void> => vault.writeBinary(path, bytes)
			})
			: new ObsidianBrowserDownload();
		const facade = new ImageActionFacade({
			confirmOverwrite: (differentCount): Promise<boolean> => confirmOverwriteImages(this.app, differentCount),
			createStorage: createObjectStorage,
			download,
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
			pathResolver,
			recordUpload: (entry): Promise<void> => uploadHistory.append(entry),
			resolveVaultPath: (target: string, noteFilePath: string): null | string => vault.resolvePath(target, noteFilePath),
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
				fileExists: (path: string): boolean => this.app.vault.getAbstractFileByPath(normalizePath(path)) !== null,
				getObsidianUrl: (path: string): string => desktop.getObsidianUrl(path),
				http,
				imageClipboard,
				modifyBinary: (path: string, bytes: Uint8Array): Promise<void> => vault.modifyBinary(path, bytes),
				move: (path: string): Promise<void> => desktop.move(path),
				openDefault: (path: string): Promise<void> => desktop.openDefault(path),
				openInCurrentTab: (path: string): Promise<void> => desktop.openInCurrentTab(path),
				openInNewTab: (path: string): Promise<void> => desktop.openInNewTab(path),
				openInNewTabGroup: (path: string): Promise<void> => desktop.openInNewTabGroup(path),
				openInNewWindow: (path: string): Promise<void> => desktop.openInNewWindow(path),
				openUrl: (url: string): Promise<void> => desktop.openUrl(url),
				pickReplacementBytes: (): Promise<null | PickedImageFile> =>
					Platform.isMobile
						? pickImageFileBytes()
						: desktop.pickReplacementBytes(),
				promptDelete: (path: string): Promise<boolean> => desktop.promptDelete(path),
				readBinary: (path: string): Promise<Uint8Array> => vault.readBinary(path),
				rename: (path: string): Promise<void> => desktop.rename(path),
				resolveVaultPath: (target: string, noteFilePath: string): null | string => vault.resolvePath(target, noteFilePath),
				shareFile: (input): Promise<void> => webShare.shareFile(input),
				shareUrl: (url: string): Promise<void> => webShare.shareUrl(url),
				showInFileList: (path: string): Promise<void> => desktop.showInFileList(path),
				showInFolder: (path: string): Promise<void> => desktop.showInFolder(path),
				star: (path: string): Promise<void> => desktop.star(path),
				toSystemPath: (path: string): string => desktop.toSystemPath(path),
				trash: (path: string): Promise<void> => vault.trash(path),
				writeBinary: (path: string, bytes: Uint8Array): Promise<void> => vault.writeBinary(path, bytes),
				writeText: (text: string): Promise<void> => desktop.writeText(text)
			}),
			linkService,
			plugin: this
		}).register();
		registerStorageGallery({
			createGallerySource: (input): Promise<import('./storage/gallery-source.ts').GalleryDataSource> =>
				createGallerySource({
					history: uploadHistory,
					storageFactory: createObjectStorage,
					vaultImages,
					...input
				}),
			createUploadStorage: createObjectStorage,
			findReferences: new RemoteImageReferenceFinder({ app: this.app, parser }),
			getSecret: (name: string): null | string => secretStore.getSecret(name),
			pickAndUpload: (request): void => {
				pickAndUploadGalleryImages({
					confirmOverwrite: (differentCount): Promise<boolean> => confirmOverwriteImages(this.app, differentCount),
					history: uploadHistory,
					onUploaded: (): void => {
						request.onUploaded();
					},
					profileId: request.profileId,
					storage: request.storage,
					template: request.template
				});
			},
			plugin: this,
			saveSettings: async (): Promise<void> => this.saveData(this.settings),
			settings: this.settings
		});
	}
}
