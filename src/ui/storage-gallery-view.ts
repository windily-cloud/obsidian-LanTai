import type {
	App,
	WorkspaceLeaf
} from 'obsidian';

import {
	DropdownComponent,
	ExtraButtonComponent,
	ItemView,
	Menu,
	Modal,
	Notice,
	SearchComponent,
	Setting
} from 'obsidian';
import { noopAsync } from 'obsidian-dev-utils/function';

import type {
	RemoteImageReference,
	RemoteImageReferenceFinder
} from '../link/remote-image-reference-finder.ts';
import type { PluginSettings } from '../settings/plugin-settings.ts';
import type { StorageProfile } from '../settings/sections/s3/storage-profile.ts';
import type {
	ObjectStorageBrowser,
	ObjectStorageFile
} from '../storage/object-storage.ts';
import type { StorageSecrets } from '../storage/storage-secrets.ts';

import {
	formatActionError,
	validateStorageSecrets
} from '../storage/storage-credential-guard.ts';

export const STORAGE_GALLERY_VIEW_TYPE = 'lantai-storage-gallery';

const IMAGE_EXTENSION_RE = /\.(?:avif|bmp|gif|ico|jpe?g|png|svg|webp)$/i;
const LIGHTBOX_CENTER_RATIO = 0.5;
const LIGHTBOX_MAX_SCALE = 8;
const LIGHTBOX_MIN_SCALE = 0.25;
const LIGHTBOX_WHEEL_LINE_HEIGHT = 16;
const LIGHTBOX_ZOOM_SENSITIVITY = 0.0015;
const PAGE_SIZE = 48;
const SEARCH_DEBOUNCE_MS = 250;
const SCROLL_LOAD_THRESHOLD = 300;

export interface StorageGalleryViewConstructorParams {
	createStorage(
		profile: StorageProfile,
		secrets: StorageSecrets
	): Promise<ObjectStorageBrowser>;
	readonly findReferences: RemoteImageReferenceFinder;
	getSecret(name: string): null | string;
	readonly leaf: WorkspaceLeaf;
	saveSettings(): Promise<void>;
	readonly settings: PluginSettings;
}

interface ButtonWithDisabledState {
	setDisabled(disabled: boolean): unknown;
}

interface DeleteStorageImageModalConstructorParams {
	readonly app: App;
	readonly file: ObjectStorageFile;
	onConfirm(): Promise<void>;
	readonly references: RemoteImageReference[];
}

type GalleryLayout = 'cards' | 'masonry';

interface StorageImageLightboxModalConstructorParams {
	readonly app: App;
	readonly fileName: string;
	readonly publicUrl: string;
}

class DeleteStorageImageModal extends Modal {
	private readonly file: ObjectStorageFile;
	private readonly onConfirm: () => Promise<void>;
	private readonly references: RemoteImageReference[];

	public constructor(params: DeleteStorageImageModalConstructorParams) {
		super(params.app);
		this.file = params.file;
		this.onConfirm = (): Promise<void> => params.onConfirm();
		this.references = params.references;
	}

	public override onClose(): void {
		this.contentEl.empty();
	}

	public override onOpen(): void {
		this.setTitle('Delete S3 image?');
		this.contentEl.createEl('p', {
			text: `This permanently deletes ${this.file.key} from object storage.`
		});
		if (this.references.length > 0) {
			this.contentEl.createEl('p', {
				text: `Referenced by ${String(this.references.length)} note${this.references.length === 1 ? '' : 's'}:`
			});
			const listEl = this.contentEl.createEl(
				'ul',
				'lantai-delete-references'
			);
			for (const reference of this.references) {
				listEl.createEl('li', {
					text: `${reference.title} (${reference.path})`
				});
			}
		}
		new Setting(this.contentEl)
			.addButton((button) =>
				button.setButtonText('Cancel').onClick(() => {
					this.close();
				})
			)
			.addButton((button) =>
				button
					.setButtonText('Delete')
					.setWarning()
					.onClick(() => {
						this.delete(button).catch((error: unknown) => {
							console.error('Failed to delete S3 image', error);
						});
					})
			);
	}

	private async delete(button: ButtonWithDisabledState): Promise<void> {
		button.setDisabled(true);
		try {
			await this.onConfirm();
			this.close();
		} catch (error) {
			button.setDisabled(false);
			new Notice(formatActionError(error));
		}
	}
}

class StorageImageLightboxModal extends Modal {
	private draggingPointerId: number | undefined;
	private readonly fileName: string;
	private imageEl: HTMLImageElement | undefined;
	private offsetX = 0;
	private offsetY = 0;
	private pointerX = 0;
	private pointerY = 0;
	private readonly publicUrl: string;
	private scale = 1;
	private stageEl: HTMLElement | undefined;

	public constructor(params: StorageImageLightboxModalConstructorParams) {
		super(params.app);
		this.fileName = params.fileName;
		this.publicUrl = params.publicUrl;
	}

	public override onClose(): void {
		this.draggingPointerId = undefined;
		this.imageEl = undefined;
		this.stageEl = undefined;
		this.contentEl.empty();
	}

	public override onOpen(): void {
		this.setTitle(this.fileName);
		this.containerEl.addClass('lantai-gallery-lightbox-container');
		this.modalEl.addClass('lantai-gallery-lightbox');
		this.stageEl = this.contentEl.createDiv(
			'lantai-gallery-lightbox-stage'
		);
		this.imageEl = this.stageEl.createEl('img', {
			attr: {
				alt: this.fileName,
				draggable: 'false',
				src: this.publicUrl
			}
		});
		this.imageEl.addClass('lantai-gallery-lightbox-image');
		this.stageEl.addEventListener('click', (event) => {
			if (event.target === this.stageEl) {
				this.close();
			}
		});
		this.stageEl.addEventListener('wheel', (event) => {
			this.zoom(event);
		}, { passive: false });
		this.imageEl.addEventListener('pointerdown', (event) => {
			this.startDragging(event);
		});
		this.imageEl.addEventListener('pointermove', (event) => {
			this.drag(event);
		});
		this.imageEl.addEventListener('pointerup', (event) => {
			this.stopDragging(event);
		});
		this.imageEl.addEventListener('pointercancel', (event) => {
			this.stopDragging(event);
		});
	}

	private applyTransform(): void {
		if (!this.imageEl) {
			return;
		}
		this.imageEl.style.transform = `translate(${String(this.offsetX)}px, ${String(this.offsetY)}px) scale(${String(this.scale)})`;
	}

	private drag(event: PointerEvent): void {
		if (event.pointerId !== this.draggingPointerId) {
			return;
		}
		this.offsetX += event.clientX - this.pointerX;
		this.offsetY += event.clientY - this.pointerY;
		this.pointerX = event.clientX;
		this.pointerY = event.clientY;
		this.applyTransform();
	}

	private startDragging(event: PointerEvent): void {
		if (!this.imageEl || event.button !== 0) {
			return;
		}
		event.preventDefault();
		this.draggingPointerId = event.pointerId;
		this.pointerX = event.clientX;
		this.pointerY = event.clientY;
		this.imageEl.setPointerCapture(event.pointerId);
		this.imageEl.addClass('is-dragging');
	}

	private stopDragging(event: PointerEvent): void {
		if (!this.imageEl || event.pointerId !== this.draggingPointerId) {
			return;
		}
		this.draggingPointerId = undefined;
		if (this.imageEl.hasPointerCapture(event.pointerId)) {
			this.imageEl.releasePointerCapture(event.pointerId);
		}
		this.imageEl.removeClass('is-dragging');
	}

	private zoom(event: WheelEvent): void {
		if (!this.stageEl) {
			return;
		}
		event.preventDefault();
		const previousScale = this.scale;
		let delta = event.deltaY;
		if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
			delta *= LIGHTBOX_WHEEL_LINE_HEIGHT;
		} else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
			delta *= this.stageEl.clientHeight;
		}
		this.scale = Math.min(
			LIGHTBOX_MAX_SCALE,
			Math.max(
				LIGHTBOX_MIN_SCALE,
				previousScale * Math.exp(-delta * LIGHTBOX_ZOOM_SENSITIVITY)
			)
		);
		const ratio = this.scale / previousScale;
		const rect = this.stageEl.getBoundingClientRect();
		const pointerX = event.clientX
			- rect.left
			- rect.width * LIGHTBOX_CENTER_RATIO;
		const pointerY = event.clientY
			- rect.top
			- rect.height * LIGHTBOX_CENTER_RATIO;
		this.offsetX = pointerX - (pointerX - this.offsetX) * ratio;
		this.offsetY = pointerY - (pointerY - this.offsetY) * ratio;
		this.applyTransform();
	}
}

/* eslint-disable perfectionist/sort-classes -- lifecycle and loading steps stay in execution order. */
export class StorageGalleryView extends ItemView {
	private cursor: string | undefined;
	private readonly createStorage: StorageGalleryViewConstructorParams['createStorage'];
	private emptyEl: HTMLElement | undefined;
	private readonly findReferences: RemoteImageReferenceFinder;
	private readonly getSecret: (name: string) => null | string;
	private gridEl: HTMLElement | undefined;
	private hasMore = true;
	private loadGeneration = 0;
	private loading = false;
	private loadingEl: HTMLElement | undefined;
	private layout: GalleryLayout = 'cards';
	private layoutButton: ExtraButtonComponent | undefined;
	private profileDropdown: DropdownComponent | undefined;
	private profileSave = noopAsync();
	private query = '';
	private searchIterator: AsyncGenerator<ObjectStorageFile, void> | undefined;
	private searchTimer: number | undefined;
	private readonly saveSettings: () => Promise<void>;
	private readonly settings: PluginSettings;
	private storage: ObjectStorageBrowser | undefined;

	public constructor(params: StorageGalleryViewConstructorParams) {
		super(params.leaf);
		this.createStorage = (profile, secrets): Promise<ObjectStorageBrowser> => params.createStorage(profile, secrets);
		this.findReferences = params.findReferences;
		this.getSecret = (name): null | string => params.getSecret(name);
		this.saveSettings = (): Promise<void> => params.saveSettings();
		this.settings = params.settings;
	}

	public override getDisplayText(): string {
		return 'S3 images';
	}

	public override getIcon(): string {
		return 'cloud';
	}

	public override getViewType(): string {
		return STORAGE_GALLERY_VIEW_TYPE;
	}

	public override async onClose(): Promise<void> {
		this.loadGeneration += 1;
		if (this.searchTimer !== undefined) {
			this.contentEl.win.clearTimeout(this.searchTimer);
		}
		await this.searchIterator?.return();
		this.contentEl.empty();
	}

	public async refresh(): Promise<void> {
		await this.ensureGalleryProfileSelection();
		this.refreshProfileDropdown();
		await this.reset();
	}

	public override async onOpen(): Promise<void> {
		await this.ensureGalleryProfileSelection();
		this.contentEl.empty();
		this.contentEl.addClass('lantai-gallery');

		const toolbarEl = this.contentEl.createDiv(
			'lantai-gallery-toolbar'
		);
		const searchEl = toolbarEl.createDiv('lantai-gallery-search');
		new SearchComponent(searchEl)
			.setPlaceholder('Search object keys...')
			.onChange((value) => {
				this.scheduleSearch(value);
			});
		const controlsEl = toolbarEl.createDiv(
			'lantai-gallery-controls'
		);
		const profileEl = controlsEl.createDiv('lantai-gallery-profile');
		this.profileDropdown = new DropdownComponent(profileEl)
			.onChange((profileId) => {
				this.selectProfile(profileId).catch((error: unknown) => {
					this.showError(error);
				});
			});
		this.profileDropdown.selectEl.setAttribute(
			'aria-label',
			'Gallery storage profile'
		);
		this.profileDropdown.selectEl.title = 'Gallery storage profile';
		this.refreshProfileDropdown();
		const layoutEl = controlsEl.createDiv('lantai-gallery-layout');
		this.layoutButton = new ExtraButtonComponent(layoutEl).onClick(() => {
			this.layout = this.layout === 'cards' ? 'masonry' : 'cards';
			this.updateLayout();
		});
		this.gridEl = this.contentEl.createDiv('lantai-gallery-grid');
		this.updateLayout();
		this.emptyEl = this.contentEl.createDiv('lantai-gallery-empty');
		this.loadingEl = this.contentEl.createDiv(
			'lantai-gallery-loading'
		);
		this.registerDomEvent(this.contentEl, 'scroll', () => {
			const remaining = this.contentEl.scrollHeight
				- this.contentEl.scrollTop
				- this.contentEl.clientHeight;
			if (remaining < SCROLL_LOAD_THRESHOLD) {
				this.loadMore().catch((error: unknown) => {
					this.showError(error);
				});
			}
		});
		await this.reset();
	}

	private async confirmDelete(
		file: ObjectStorageFile,
		publicUrl: string
	): Promise<void> {
		const storage = this.storage;
		if (!storage) {
			return;
		}
		const references = await this.findReferences.find(publicUrl);
		new DeleteStorageImageModal({
			app: this.app,
			file,
			onConfirm: async (): Promise<void> => {
				if (storage !== this.storage) {
					throw new Error(
						'Storage profile or search changed. Open the delete menu again.'
					);
				}
				await storage.delete(file.key);
				for (const card of this.gridEl?.children ?? []) {
					if (card.getAttribute('data-object-key') === file.key) {
						card.remove();
						break;
					}
				}
				this.updateEmptyState();
				new Notice('S3 image deleted');
			},
			references
		}).open();
	}

	private async createActiveStorage(): Promise<ObjectStorageBrowser> {
		const profile = this.getSelectedProfile();
		if (!profile) {
			throw new Error('No active storage profile');
		}
		if (!profile.publicBaseUrl.trim()) {
			throw new Error('Public Base URL is required');
		}
		const accessKeyId = this.getSecret(profile.accessKeyIdSecretName);
		const secretAccessKey = this.getSecret(profile.secretAccessKeySecretName);
		if (!accessKeyId || !secretAccessKey) {
			throw new Error('Storage profile secrets are missing');
		}
		const secretProblem = validateStorageSecrets({
			accessKeyId,
			accessKeyIdSecretName: profile.accessKeyIdSecretName,
			secretAccessKey,
			secretAccessKeySecretName: profile.secretAccessKeySecretName
		});
		if (secretProblem) {
			throw new Error(secretProblem);
		}
		return this.createStorage(profile, { accessKeyId, secretAccessKey });
	}

	private async ensureGalleryProfileSelection(): Promise<void> {
		const profile = this.getSelectedProfile();
		const hasValidGalleryProfile = this.settings.profiles.some(
			(item) => item.id === this.settings.galleryProfileId
		);
		if (!hasValidGalleryProfile && profile) {
			this.settings.galleryProfileId = profile.id;
			await this.queueSettingsSave();
		}
	}

	private getSelectedProfile(): StorageProfile | undefined {
		return selectGalleryProfile(
			this.settings.profiles,
			this.settings.galleryProfileId,
			this.settings.activeProfileId
		);
	}

	private async loadMore(): Promise<void> {
		const storage = this.storage;
		if (this.loading || !this.hasMore || !storage) {
			return;
		}
		this.loading = true;
		this.loadingEl?.setText('Loading...');
		const generation = this.loadGeneration;
		try {
			const files = this.query
				? await this.loadSearchPage(generation)
				: await this.loadListPage(generation, storage);
			if (generation !== this.loadGeneration) {
				return;
			}
			for (const file of files) {
				await this.renderFile(file, generation, storage);
			}
			this.updateEmptyState();
		} catch (error) {
			if (generation !== this.loadGeneration) {
				return;
			}
			throw error;
		} finally {
			if (generation === this.loadGeneration) {
				this.loading = false;
				this.loadingEl?.setText('');
			}
		}
		if (
			generation === this.loadGeneration
			&& this.contentEl.scrollHeight <= this.contentEl.clientHeight
		) {
			await this.loadMore();
		}
	}

	private async loadListPage(
		generation: number,
		storage: ObjectStorageBrowser
	): Promise<ObjectStorageFile[]> {
		const images: ObjectStorageFile[] = [];
		let cursor = this.cursor;
		do {
			const page = await storage.list({
				...(cursor === undefined ? {} : { cursor }),
				limit: PAGE_SIZE
			});
			if (generation !== this.loadGeneration) {
				return [];
			}
			images.push(...page.items.filter(isImageFile));
			cursor = page.cursor;
			this.cursor = cursor;
			this.hasMore = page.cursor !== undefined;
		} while (images.length < PAGE_SIZE && this.hasMore);
		return images;
	}

	private async loadSearchPage(
		generation: number
	): Promise<ObjectStorageFile[]> {
		const images: ObjectStorageFile[] = [];
		const iterator = this.searchIterator;
		if (!iterator) {
			this.hasMore = false;
			return images;
		}
		while (images.length < PAGE_SIZE) {
			const result = await iterator.next();
			if (generation !== this.loadGeneration) {
				return [];
			}
			if (result.done) {
				this.hasMore = false;
				break;
			}
			if (isImageFile(result.value)) {
				images.push(result.value);
			}
		}
		return images;
	}

	private async renderFile(
		file: ObjectStorageFile,
		generation: number,
		storage: ObjectStorageBrowser
	): Promise<void> {
		if (!this.gridEl) {
			return;
		}
		const publicUrl = await storage.buildPublicUrl(file.key);
		if (generation !== this.loadGeneration) {
			return;
		}
		const cardEl = this.gridEl.createDiv('lantai-gallery-card');
		cardEl.dataset['objectKey'] = file.key;
		cardEl.title = file.key;
		cardEl.tabIndex = 0;
		const fileName = getObjectFileName(file.key);
		cardEl.setAttribute(
			'aria-label',
			`${fileName}. Press Enter to view full size or Shift+F10 for actions.`
		);
		const imageEl = cardEl.createEl('img', {
			attr: { alt: fileName, loading: 'lazy', src: publicUrl }
		});
		imageEl.addClass('lantai-gallery-image');
		const nameEl = cardEl.createDiv({
			cls: 'lantai-gallery-name',
			text: fileName
		});
		nameEl.title = file.key;
		cardEl.addEventListener('dblclick', () => {
			this.openLightbox(fileName, publicUrl);
		});
		cardEl.addEventListener('contextmenu', (event) => {
			event.preventDefault();
			this.createFileMenu(file, publicUrl).showAtMouseEvent(event);
		});
		cardEl.addEventListener('keydown', (event) => {
			if (event.key === 'Enter') {
				event.preventDefault();
				this.openLightbox(fileName, publicUrl);
				return;
			}
			if (event.key !== 'ContextMenu' && !(event.key === 'F10' && event.shiftKey)) {
				return;
			}
			event.preventDefault();
			const rect = cardEl.getBoundingClientRect();
			this.createFileMenu(file, publicUrl).showAtPosition(
				{ x: rect.left, y: rect.bottom },
				cardEl.doc
			);
		});
	}

	private openLightbox(fileName: string, publicUrl: string): void {
		new StorageImageLightboxModal({
			app: this.app,
			fileName,
			publicUrl
		}).open();
	}

	private createFileMenu(file: ObjectStorageFile, publicUrl: string): Menu {
		return new Menu().addItem((item) =>
			item
				.setIcon('trash')
				.setTitle('Delete S3 image')
				.onClick(() => {
					this.confirmDelete(file, publicUrl).catch((error: unknown) => {
						this.showError(error);
					});
				})
		);
	}

	private async reset(): Promise<void> {
		const generation = ++this.loadGeneration;
		const previousIterator = this.searchIterator;
		this.searchIterator = undefined;
		this.cursor = undefined;
		this.gridEl?.empty();
		this.hasMore = true;
		this.loading = false;
		this.emptyEl?.setText('');
		this.loadingEl?.setText('Loading...');
		try {
			await previousIterator?.return();
			if (generation !== this.loadGeneration) {
				return;
			}
			const storage = await this.createActiveStorage();
			if (generation !== this.loadGeneration) {
				return;
			}
			this.storage = storage;
			if (this.query) {
				this.searchIterator = storage.search(this.query);
			}
			await this.loadMore();
		} catch (error) {
			if (generation !== this.loadGeneration) {
				return;
			}
			this.storage = undefined;
			this.hasMore = false;
			this.showError(error);
		}
	}

	private async selectProfile(profileId: string): Promise<void> {
		if (!this.settings.profiles.some((profile) => profile.id === profileId)) {
			return;
		}
		const previousProfileId = this.settings.galleryProfileId;
		this.settings.galleryProfileId = profileId;
		try {
			await this.queueSettingsSave();
			if (this.settings.galleryProfileId === profileId) {
				await this.reset();
			}
		} catch (error) {
			if (this.settings.galleryProfileId === profileId) {
				this.settings.galleryProfileId = previousProfileId;
				this.refreshProfileDropdown();
			}
			throw error;
		}
	}

	private queueSettingsSave(): Promise<void> {
		const save = this.profileSave.then(() => this.saveSettings());
		this.profileSave = save.catch(() => undefined);
		return save;
	}

	private refreshProfileDropdown(): void {
		if (!this.profileDropdown) {
			return;
		}
		this.profileDropdown.selectEl.empty();
		if (this.settings.profiles.length === 0) {
			this.profileDropdown.addOption('', 'No storage profiles');
		} else {
			for (const profile of this.settings.profiles) {
				this.profileDropdown.addOption(
					profile.id,
					profile.name || 'Untitled profile'
				);
			}
		}
		this.profileDropdown
			.setValue(this.getSelectedProfile()?.id ?? '')
			.setDisabled(this.settings.profiles.length === 0);
	}

	private scheduleSearch(value: string): void {
		const query = value.trim();
		if (this.searchTimer !== undefined) {
			this.contentEl.win.clearTimeout(this.searchTimer);
		}
		this.searchTimer = this.contentEl.win.setTimeout(() => {
			this.query = query;
			this.reset().catch((error: unknown) => {
				this.showError(error);
			});
		}, SEARCH_DEBOUNCE_MS);
	}

	private showError(error: unknown): void {
		const message = formatActionError(error);
		this.loading = false;
		this.loadingEl?.setText('');
		this.emptyEl?.setText(message);
		console.error('Failed to load S3 images', error);
	}

	private updateEmptyState(): void {
		if ((this.gridEl?.childElementCount ?? 0) > 0) {
			this.emptyEl?.setText('');
			return;
		}
		this.emptyEl?.setText(
			this.query ? 'No matching images' : 'No images found'
		);
	}

	private updateLayout(): void {
		const isMasonry = this.layout === 'masonry';
		this.gridEl?.toggleClass(
			'lantai-gallery-grid--masonry',
			isMasonry
		);
		this.layoutButton
			?.setIcon(isMasonry ? 'layout-grid' : 'columns-3')
			.setTooltip(isMasonry ? 'Switch to card view' : 'Switch to masonry view');
		const buttonEl = this.layoutButton?.extraSettingsEl;
		if (buttonEl) {
			buttonEl.setAttribute('aria-pressed', String(isMasonry));
			buttonEl.setAttribute('aria-label', 'Masonry view');
		}
	}
}
/* eslint-enable perfectionist/sort-classes -- lifecycle and loading steps stay in execution order. */

export function getObjectFileName(objectKey: string): string {
	return objectKey.split('/').at(-1) ?? objectKey;
}

export function selectGalleryProfile(
	profiles: readonly StorageProfile[],
	galleryProfileId: null | string,
	activeProfileId: null | string
): StorageProfile | undefined {
	return profiles.find((profile) => profile.id === galleryProfileId)
		?? profiles.find((profile) => profile.id === activeProfileId);
}

function isImageFile(file: ObjectStorageFile): boolean {
	return IMAGE_EXTENSION_RE.test(file.key);
}
