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
	Platform,
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
	CreateGallerySourceInput,
	GalleryDataSource,
	GalleryImage,
	GallerySourceKind
} from '../storage/gallery-source.ts';
import type { ObjectStorage } from '../storage/object-storage.ts';
import type { StorageSecrets } from '../storage/storage-secrets.ts';
import type { GalleryUploadRequest } from './gallery-uploader.ts';

import { t } from '../i18n/index.ts';
import {
	formatActionError,
	isListAccessDenied,
	validateStorageSecrets
} from '../storage/storage-credential-guard.ts';
import {
	LONG_PRESS_HOLD_MS,
	LONG_PRESS_MAX_MOVE_PX,
	LongPressGesture
} from './long-press-gesture.ts';

export const STORAGE_GALLERY_VIEW_TYPE = 'lantai-storage-gallery';

const LIGHTBOX_CENTER_RATIO = 0.5;
const LIGHTBOX_MAX_SCALE = 8;
const LIGHTBOX_MIN_SCALE = 0.25;
const LIGHTBOX_WHEEL_LINE_HEIGHT = 16;
const LIGHTBOX_ZOOM_SENSITIVITY = 0.0015;
const PAGE_SIZE = 48;
const SEARCH_DEBOUNCE_MS = 250;
const SCROLL_LOAD_THRESHOLD = 300;

interface ButtonWithDisabledState {
	setDisabled(disabled: boolean): unknown;
}

interface DeleteStorageImageModalConstructorParams {
	readonly app: App;
	readonly description?: string;
	readonly file: GalleryImage;
	onConfirm(): Promise<void>;
	readonly references: RemoteImageReference[];
}

type GalleryLayout = 'cards' | 'masonry';

interface StorageGalleryViewConstructorParams {
	createGallerySource(input: CreateGallerySourceInput): Promise<GalleryDataSource>;
	createUploadStorage(
		profile: StorageProfile,
		secrets: StorageSecrets
	): Promise<ObjectStorage>;
	readonly findReferences: RemoteImageReferenceFinder;
	getSecret(name: string): null | string;
	readonly leaf: WorkspaceLeaf;
	pickAndUpload(params: GalleryUploadRequest): void;
	saveSettings(): Promise<void>;
	readonly settings: PluginSettings;
}

interface StorageImageLightboxModalConstructorParams {
	readonly app: App;
	readonly fileName: string;
	readonly publicUrl: string;
}

class DeleteStorageImageModal extends Modal {
	private readonly description: string | undefined;
	private readonly file: GalleryImage;
	private readonly onConfirm: () => Promise<void>;
	private readonly references: RemoteImageReference[];

	public constructor(params: DeleteStorageImageModalConstructorParams) {
		super(params.app);
		this.description = params.description;
		this.file = params.file;
		this.onConfirm = (): Promise<void> => params.onConfirm();
		this.references = params.references;
	}

	public override onClose(): void {
		this.contentEl.empty();
	}

	public override onOpen(): void {
		this.setTitle(t('gallery.deleteTitle'));
		this.contentEl.createEl('p', {
			text: this.description
				?? t('gallery.permanentlyDeletes', { key: this.file.key })
		});
		if (this.references.length > 0) {
			this.contentEl.createEl('p', {
				text: t('gallery.referencedBy', { count: this.references.length })
			});
			const listEl = this.contentEl.createEl('ul', 'lantai-delete-references');
			for (const reference of this.references) {
				listEl.createEl('li', {
					text: `${reference.title} (${reference.path})`
				});
			}
		}
		new Setting(this.contentEl)
			.addButton((button) =>
				button.setButtonText(t('gallery.cancel')).onClick(() => {
					this.close();
				})
			)
			.addButton((button) =>
				button
					.setButtonText(t('gallery.delete'))
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
		this.stageEl = this.contentEl.createDiv('lantai-gallery-lightbox-stage');
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
		this.stageEl.addEventListener(
			'wheel',
			(event) => {
				this.zoom(event);
			},
			{ passive: false }
		);
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
		const pointerX = event.clientX - rect.left - rect.width * LIGHTBOX_CENTER_RATIO;
		const pointerY = event.clientY - rect.top - rect.height * LIGHTBOX_CENTER_RATIO;
		this.offsetX = pointerX - (pointerX - this.offsetX) * ratio;
		this.offsetY = pointerY - (pointerY - this.offsetY) * ratio;
		this.applyTransform();
	}
}

/* eslint-disable perfectionist/sort-classes -- lifecycle and loading steps stay in execution order. */
export class StorageGalleryView extends ItemView {
	private readonly createGallerySource: (
		input: CreateGallerySourceInput
	) => Promise<GalleryDataSource>;

	private readonly createUploadStorage: (
		profile: StorageProfile,
		secrets: StorageSecrets
	) => Promise<ObjectStorage>;

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
	private lastLoadError: unknown;
	private readonly pickAndUpload: (params: GalleryUploadRequest) => void;
	private profileDropdown: DropdownComponent | undefined;
	private profileEl: HTMLElement | undefined;
	private profileSave = noopAsync();
	private query = '';
	private scrollEl: HTMLElement | undefined;
	private searchTimer: number | undefined;
	private readonly saveSettings: () => Promise<void>;
	private readonly settings: PluginSettings;
	private source: GalleryDataSource | undefined;
	private readonly sourceButtons = new Map<GallerySourceKind, HTMLButtonElement>();
	private uploadEl: HTMLElement | undefined;
	private readonly brokenImageHandled = new Set<string>();
	private readonly brokenImageInFlight = new Set<string>();

	public constructor(params: StorageGalleryViewConstructorParams) {
		super(params.leaf);
		this.createGallerySource = (input): Promise<GalleryDataSource> => params.createGallerySource(input);
		this.createUploadStorage = (profile, secrets): Promise<ObjectStorage> => params.createUploadStorage(profile, secrets);
		this.findReferences = params.findReferences;
		this.getSecret = (name): null | string => params.getSecret(name);
		this.pickAndUpload = (uploadParams): void => {
			params.pickAndUpload(uploadParams);
		};
		this.saveSettings = (): Promise<void> => params.saveSettings();
		this.settings = params.settings;
	}

	public override getDisplayText(): string {
		return t('gallery.viewTitle');
	}

	public override getIcon(): string {
		return 'cloud';
	}

	public override getViewType(): string {
		return STORAGE_GALLERY_VIEW_TYPE;
	}

	public override onClose(): Promise<void> {
		this.loadGeneration += 1;
		if (this.searchTimer !== undefined) {
			this.contentEl.win.clearTimeout(this.searchTimer);
		}
		this.contentEl.empty();
		return noopAsync();
	}

	public async refresh(): Promise<void> {
		this.refreshProfileDropdown();
		await this.loadActiveSource();
	}

	public override async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass('lantai-gallery');

		const toolbarEl = this.contentEl.createDiv('lantai-gallery-toolbar');
		const searchEl = toolbarEl.createDiv('lantai-gallery-search');
		new SearchComponent(searchEl)
			.setPlaceholder(t('gallery.searchPlaceholder'))
			.onChange((value) => {
				this.scheduleSearch(value);
			});
		this.buildSourceSegments(toolbarEl);
		const controlsEl = toolbarEl.createDiv('lantai-gallery-controls');
		this.profileEl = controlsEl.createDiv('lantai-gallery-profile');
		this.profileDropdown = new DropdownComponent(this.profileEl).onChange(
			(profileId) => {
				this.selectProfile(profileId).catch((error: unknown) => {
					this.showError(error);
				});
			}
		);
		this.profileDropdown.selectEl.setAttribute(
			'aria-label',
			t('gallery.profileAria')
		);
		this.profileDropdown.selectEl.title = t('gallery.profileAria');
		this.refreshProfileDropdown();
		const uploadEl = controlsEl.createDiv('lantai-gallery-upload');
		this.uploadEl = uploadEl;
		new ExtraButtonComponent(uploadEl)
			.setIcon('upload')
			.setTooltip(t('gallery.uploadButton'))
			.onClick(() => {
				this.openUpload().catch((error: unknown) => {
					this.showError(error);
				});
			});
		const layoutEl = controlsEl.createDiv('lantai-gallery-layout');
		this.layoutButton = new ExtraButtonComponent(layoutEl).onClick(() => {
			this.layout = this.layout === 'cards' ? 'masonry' : 'cards';
			this.updateLayout();
		});
		this.scrollEl = this.contentEl.createDiv('lantai-gallery-body');
		this.gridEl = this.scrollEl.createDiv('lantai-gallery-grid');
		this.updateLayout();
		this.emptyEl = this.scrollEl.createDiv('lantai-gallery-empty');
		this.loadingEl = this.scrollEl.createDiv('lantai-gallery-loading');
		this.registerDomEvent(this.scrollEl, 'scroll', () => {
			const scrollEl = this.scrollEl;
			if (!scrollEl) {
				return;
			}
			const remaining = scrollEl.scrollHeight
				- scrollEl.scrollTop
				- scrollEl.clientHeight;
			if (remaining < SCROLL_LOAD_THRESHOLD) {
				this.loadMore().catch((error: unknown) => {
					this.showError(error);
				});
			}
		});
		this.toggleSourceControls();
		await this.loadActiveSource();
	}

	private async confirmDelete(
		image: GalleryImage,
		publicUrl: string
	): Promise<void> {
		const source = this.source;
		if (!source) {
			return;
		}
		const references = source.kind === 'vault' ? [] : await this.findReferences.find(publicUrl);
		new DeleteStorageImageModal({
			app: this.app,
			...(source.kind === 'vault'
				? { description: t('gallery.deletesVaultFile', { path: image.key }) }
				: {}),
			file: image,
			onConfirm: async (): Promise<void> => {
				if (source !== this.source) {
					throw new Error(t('errors.galleryProfileChanged'));
				}
				await source.delete(image);
				this.removeCard(image.key);
				new Notice(t('gallery.deletedNotice'));
			},
			references
		}).open();
	}

	private async createActiveSource(): Promise<GalleryDataSource> {
		const kind = this.settings.gallerySource;
		if (kind === 'vault') {
			return this.createGallerySource({
				kind,
				profile: undefined,
				secrets: undefined
			});
		}
		const profile = this.getSelectedProfile();
		if (!profile) {
			throw new Error(t('errors.noActiveStorageProfile'));
		}
		if (!profile.publicBaseUrl.trim()) {
			throw new Error(t('errors.publicBaseUrlRequired'));
		}
		const accessKeyId = this.getSecret(profile.accessKeyIdSecretName);
		const secretAccessKey = this.getSecret(profile.secretAccessKeySecretName);
		if (!accessKeyId || !secretAccessKey) {
			throw new Error(t('errors.storageSecretsMissing'));
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
		return this.createGallerySource({
			kind,
			profile,
			secrets: { accessKeyId, secretAccessKey }
		});
	}

	private getSelectedProfile(): StorageProfile | undefined {
		return selectGalleryProfile(
			this.settings.profiles,
			this.settings.galleryProfileId
		);
	}

	private async loadMore(): Promise<void> {
		const source = this.source;
		if (this.loading || !this.hasMore || !source) {
			return;
		}
		this.loading = true;
		this.loadingEl?.setText(t('gallery.loading'));
		const generation = this.loadGeneration;
		try {
			const page = await source.loadMore(PAGE_SIZE);
			if (generation !== this.loadGeneration) {
				return;
			}
			this.hasMore = page.hasMore;
			for (const image of page.items) {
				await this.renderFile(image, generation);
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
		const scrollEl = this.scrollEl;
		if (
			generation === this.loadGeneration
			&& scrollEl
			&& scrollEl.scrollHeight <= scrollEl.clientHeight
		) {
			await this.loadMore();
		}
	}

	private async renderFile(
		image: GalleryImage,
		generation: number
	): Promise<void> {
		const source = this.source;
		if (!this.gridEl || !source) {
			return;
		}
		const url = await source.thumbnailUrl(image);
		if (generation !== this.loadGeneration) {
			return;
		}
		const cardEl = this.gridEl.createDiv('lantai-gallery-card');
		cardEl.dataset['objectKey'] = image.key;
		cardEl.title = image.key;
		cardEl.tabIndex = 0;
		cardEl.setAttribute(
			'aria-label',
			`${image.name}. Press Enter to view full size or Shift+F10 for actions.`
		);
		const imageEl = cardEl.createEl('img', {
			attr: { alt: image.name, loading: 'lazy', src: url }
		});
		imageEl.addClass('lantai-gallery-image');
		const nameEl = cardEl.createDiv({
			cls: 'lantai-gallery-name',
			text: image.name
		});
		nameEl.title = image.key;
		cardEl.addEventListener('dblclick', () => {
			this.openLightbox(image.name, url);
		});
		if (source.kind === 'recent') {
			imageEl.addEventListener('error', () => {
				this.handleBrokenImage(image, imageEl, generation).catch(
					(error: unknown) => {
						this.showError(error);
					}
				);
			});
		}
		cardEl.addEventListener('contextmenu', (event) => {
			if (cardEl.dataset['lantaiLongPress'] === '1') {
				event.preventDefault();
				return;
			}
			event.preventDefault();
			this.createFileMenu(image, url).showAtMouseEvent(event);
		});
		if (Platform.isMobile) {
			this.bindCardLongPress(cardEl, image, url);
		}
		cardEl.addEventListener('keydown', (event) => {
			if (event.key === 'Enter') {
				event.preventDefault();
				this.openLightbox(image.name, url);
				return;
			}
			if (
				event.key !== 'ContextMenu'
				&& !(event.key === 'F10' && event.shiftKey)
			) {
				return;
			}
			event.preventDefault();
			const rect = cardEl.getBoundingClientRect();
			this.createFileMenu(image, url).showAtPosition(
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

	private bindCardLongPress(
		cardEl: HTMLElement,
		image: GalleryImage,
		url: string
	): void {
		let gesture: LongPressGesture | null = null;
		cardEl.addEventListener('touchstart', (event) => {
			if (event.touches.length !== 1) {
				gesture?.cancel();
				gesture = null;
				return;
			}
			const touch = event.touches[0];
			if (!touch) {
				return;
			}
			delete cardEl.dataset['lantaiLongPress'];
			gesture = new LongPressGesture({
				holdMs: LONG_PRESS_HOLD_MS,
				maxMovePx: LONG_PRESS_MAX_MOVE_PX,
				onLongPress: (point): void => {
					cardEl.dataset['lantaiLongPress'] = '1';
					this.createFileMenu(image, url).showAtPosition(
						{ x: point.x, y: point.y },
						cardEl.doc
					);
				}
			});
			gesture.touchStart({ x: touch.clientX, y: touch.clientY });
		}, { passive: true });
		cardEl.addEventListener('touchmove', (event) => {
			const touch = event.touches[0];
			if (!gesture || !touch) {
				return;
			}
			gesture.touchMove({ x: touch.clientX, y: touch.clientY });
		}, { passive: true });
		const end = (event: TouchEvent): void => {
			if (!gesture) {
				return;
			}
			gesture.touchEnd();
			if (event.type === 'touchend' && !gesture.consumeFired() && !gesture.wasMoved()) {
				this.openLightbox(image.name, url);
			}
		};
		cardEl.addEventListener('touchend', end, { passive: true });
		cardEl.addEventListener('touchcancel', end, { passive: true });
		cardEl.addEventListener('click', (event) => {
			if (gesture?.consumeFired() || cardEl.dataset['lantaiLongPress'] === '1') {
				event.preventDefault();
			}
		});
	}

	private buildSourceSegments(container: HTMLElement): void {
		const sourceEl = container.createDiv('lantai-gallery-source');
		const segments: [GallerySourceKind, string][] = [
			['recent', t('gallery.sourceRecent')],
			['bucket', t('gallery.sourceBucket')],
			['vault', t('gallery.sourceVault')]
		];
		for (const [kind, label] of segments) {
			const button = sourceEl.createEl('button', { text: label });
			button.addClass('lantai-gallery-source-button');
			button.setAttribute(
				'aria-pressed',
				String(kind === this.settings.gallerySource)
			);
			button.addEventListener('click', () => {
				this.selectSource(kind).catch((error: unknown) => {
					this.showError(error);
				});
			});
			this.sourceButtons.set(kind, button);
		}
	}

	private createFileMenu(image: GalleryImage, publicUrl: string): Menu {
		return new Menu()
			.addItem((item) =>
				item
					.setIcon('link')
					.setTitle(t('gallery.copyUrl'))
					.onClick(() => {
						this.copyUrl(publicUrl).catch((error: unknown) => {
							this.showError(error);
						});
					})
			)
			.addItem((item) =>
				item
					.setIcon('trash')
					.setTitle(t('gallery.deleteMenu'))
					.onClick(() => {
						this.confirmDelete(image, publicUrl).catch((error: unknown) => {
							this.showError(error);
						});
					})
			);
	}

	private async copyUrl(publicUrl: string): Promise<void> {
		// eslint-disable-next-line n/no-unsupported-features/node-builtins -- desktop clipboard API
		await window.navigator.clipboard.writeText(publicUrl);
		new Notice(t('gallery.urlCopiedNotice'));
	}

	private async handleBrokenImage(
		image: GalleryImage,
		imageEl: HTMLImageElement,
		generation: number
	): Promise<void> {
		const source = this.source;
		if (
			generation !== this.loadGeneration
			|| source?.kind !== 'recent'
			|| this.brokenImageHandled.has(image.key)
			|| this.brokenImageInFlight.has(image.key)
		) {
			return;
		}
		this.brokenImageInFlight.add(image.key);
		try {
			const stillPresent = await source.verify(image);
			if (generation !== this.loadGeneration) {
				return;
			}
			this.brokenImageHandled.add(image.key);
			if (stillPresent) {
				const url = await source.thumbnailUrl(image);
				if (generation !== this.loadGeneration) {
					return;
				}
				imageEl.src = url;
				return;
			}
			await source.purge(image);
			this.removeCard(image.key);
			new Notice(t('gallery.brokenRemovedNotice'));
		} finally {
			this.brokenImageInFlight.delete(image.key);
		}
	}

	private async onUploaded(): Promise<void> {
		if (this.settings.gallerySource === 'recent') {
			await this.reset();
			return;
		}
		await this.selectSource('recent');
	}

	private async openUpload(): Promise<void> {
		if (this.settings.gallerySource === 'vault') {
			return;
		}
		const profile = this.getSelectedProfile();
		if (!profile) {
			throw new Error(t('errors.noActiveStorageProfile'));
		}
		if (!profile.publicBaseUrl.trim()) {
			throw new Error(t('errors.publicBaseUrlRequired'));
		}
		const accessKeyId = this.getSecret(profile.accessKeyIdSecretName);
		const secretAccessKey = this.getSecret(profile.secretAccessKeySecretName);
		if (!accessKeyId || !secretAccessKey) {
			throw new Error(t('errors.storageSecretsMissing'));
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
		const storage = await this.createUploadStorage(profile, {
			accessKeyId,
			secretAccessKey
		});
		this.pickAndUpload({
			onUploaded: (): void => {
				this.onUploaded().catch((error: unknown) => {
					this.showError(error);
				});
			},
			profileId: profile.id,
			storage,
			template: profile.objectKeyTemplate
		});
	}

	private removeCard(key: string): void {
		for (const card of this.gridEl?.children ?? []) {
			if (card.getAttribute('data-object-key') === key) {
				card.remove();
				break;
			}
		}
		this.updateEmptyState();
	}

	private async reset(): Promise<boolean> {
		const generation = ++this.loadGeneration;
		this.brokenImageHandled.clear();
		this.brokenImageInFlight.clear();
		this.gridEl?.empty();
		this.hasMore = true;
		this.loading = false;
		this.emptyEl?.setText('');
		this.loadingEl?.setText(t('gallery.loading'));
		try {
			const source = await this.createActiveSource();
			if (generation !== this.loadGeneration) {
				return true;
			}
			this.source = source;
			source.setQuery(this.query);
			await this.loadMore();
			return true;
		} catch (error) {
			if (generation !== this.loadGeneration) {
				return true;
			}
			this.source = undefined;
			this.hasMore = false;
			this.loading = false;
			this.loadingEl?.setText('');
			this.lastLoadError = error;
			return false;
		}
	}

	private async loadActiveSource(): Promise<void> {
		if (!(await this.reset())) {
			this.presentLoadFailure();
		}
	}

	private presentLoadFailure(): void {
		if (this.lastLoadError === undefined) {
			return;
		}
		this.showError(this.lastLoadError);
	}

	private async selectProfile(profileId: string): Promise<void> {
		if (!this.settings.profiles.some((profile) => profile.id === profileId)) {
			return;
		}
		const previousProfileId = this.settings.galleryProfileId;
		this.settings.galleryProfileId = profileId;
		try {
			await this.queueSettingsSave();
		} catch (error) {
			if (this.settings.galleryProfileId === profileId) {
				this.settings.galleryProfileId = previousProfileId;
				this.refreshProfileDropdown();
			}
			throw error;
		}
		if (this.settings.galleryProfileId !== profileId) {
			return;
		}
		const loaded = await this.reset();
		if (!loaded) {
			this.presentLoadFailure();
		}
	}

	private async selectSource(kind: GallerySourceKind): Promise<void> {
		if (kind === this.settings.gallerySource) {
			return;
		}
		const previousKind = this.settings.gallerySource;
		this.settings.gallerySource = kind;
		this.updateSourceButtons();
		try {
			await this.queueSettingsSave();
		} catch (error) {
			if (this.settings.gallerySource === kind) {
				this.settings.gallerySource = previousKind;
				this.updateSourceButtons();
			}
			throw error;
		}
		if (this.settings.gallerySource !== kind) {
			return;
		}
		this.toggleSourceControls();
		if (!(await this.reset())) {
			this.presentLoadFailure();
		}
	}

	private toggleSourceControls(): void {
		const isVault = this.settings.gallerySource === 'vault';
		if (this.profileEl) {
			this.profileEl.style.display = isVault ? 'none' : '';
		}
		if (this.uploadEl) {
			this.uploadEl.style.display = isVault ? 'none' : '';
		}
	}

	private updateSourceButtons(): void {
		for (const [kind, button] of this.sourceButtons) {
			button.setAttribute(
				'aria-pressed',
				String(kind === this.settings.gallerySource)
			);
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
		const galleryProfileId = this.settings.galleryProfileId;
		const knownSelected = galleryProfileId !== null
			&& this.settings.profiles.some((profile) => profile.id === galleryProfileId);
		if (this.settings.profiles.length === 0) {
			this.profileDropdown.addOption('', t('gallery.noProfiles'));
		} else {
			if (!knownSelected) {
				this.profileDropdown.addOption('', t('gallery.selectProfile'));
			}
			for (const profile of this.settings.profiles) {
				this.profileDropdown.addOption(
					profile.id,
					profile.name || t('gallery.untitledProfile')
				);
			}
		}
		this.profileDropdown
			.setValue(knownSelected ? galleryProfileId : '')
			.setDisabled(this.settings.profiles.length === 0);
	}

	private scheduleSearch(value: string): void {
		const query = value.trim();
		if (this.searchTimer !== undefined) {
			this.contentEl.win.clearTimeout(this.searchTimer);
		}
		this.searchTimer = this.contentEl.win.setTimeout(() => {
			this.query = query;
			this.reset()
				.then((loaded) => {
					if (!loaded) {
						this.presentLoadFailure();
					}
				})
				.catch((error: unknown) => {
					this.showError(error);
				});
		}, SEARCH_DEBOUNCE_MS);
	}

	private showError(error: unknown): void {
		const message = formatActionError(error);
		this.loading = false;
		this.loadingEl?.setText('');
		this.emptyEl?.setText(message);
		if (isListAccessDenied(error)) {
			console.warn('Gallery bucket list denied', error);
			return;
		}
		console.error('Failed to load gallery images', error);
	}

	private updateEmptyState(): void {
		if ((this.gridEl?.childElementCount ?? 0) > 0) {
			this.emptyEl?.setText('');
			return;
		}
		this.emptyEl?.setText(
			this.query ? t('gallery.noMatching') : t('gallery.noImages')
		);
	}

	private updateLayout(): void {
		const isMasonry = this.layout === 'masonry';
		this.gridEl?.toggleClass('lantai-gallery-grid--masonry', isMasonry);
		this.layoutButton
			?.setIcon(isMasonry ? 'layout-grid' : 'columns-3')
			.setTooltip(
				isMasonry ? t('gallery.switchToCard') : t('gallery.switchToMasonry')
			);
		const buttonEl = this.layoutButton?.extraSettingsEl;
		if (buttonEl) {
			buttonEl.setAttribute('aria-pressed', String(isMasonry));
			buttonEl.setAttribute('aria-label', t('gallery.masonryAria'));
		}
	}
}
/* eslint-enable perfectionist/sort-classes -- lifecycle and loading steps stay in execution order. */

/** Exposed for unit tests. */
export function getObjectFileName(objectKey: string): string {
	return objectKey.split('/').at(-1) ?? objectKey;
}

/** Exposed for unit tests. */
export function selectGalleryProfile(
	profiles: readonly StorageProfile[],
	galleryProfileId: null | string
): StorageProfile | undefined {
	if (!galleryProfileId) {
		return undefined;
	}
	return profiles.find((profile) => profile.id === galleryProfileId);
}
