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

import type { LocalImageReferenceFinder } from '../../link/local-image-reference-finder.ts';
import type {
	RemoteImageReference,
	RemoteImageReferenceFinder
} from '../../link/remote-image-reference-finder.ts';
import type { PluginSettings } from '../../settings/plugin-settings.ts';
import type { StorageProfile } from '../../settings/sections/s3/storage-profile.ts';
import type {
	CreateGallerySourceInput,
	GalleryDataSource,
	GalleryImage,
	GallerySourceKind
} from '../../storage/gallery-source.ts';
import type {
	GallerySortKey,
	GallerySortOrder,
	ObjectStorage
} from '../../storage/object-storage.ts';
import type { StorageSecrets } from '../../storage/storage-secrets.ts';
import type { GallerySession } from './gallery-session.ts';
import type { GalleryUploadRequest } from './gallery-uploader.ts';

import { ObsidianGallerySessionStore } from '../../adapters/obsidian/gallery-session.obsidian.ts';
import { t } from '../../i18n/index.ts';
import { formatBytes } from '../../lantai/lantai-account.ts';
import {
	formatGalleryDropEmbed,
	GALLERY_DROP_EMBED_MIME,
	interceptGalleryEditorDrop
} from '../../link/gallery-drop-embed.ts';
import {
	formatActionError,
	isListAccessDenied,
	validateStorageSecrets
} from '../../storage/storage-credential-guard.ts';
import {
	LONG_PRESS_HOLD_MS,
	LONG_PRESS_MAX_MOVE_PX,
	LongPressGesture
} from '../long-press-gesture.ts';
import {
	formatGalleryDate,
	GALLERY_PANEL_WIDTH_DEFAULT,
	GALLERY_PANEL_WIDTH_MAX,
	GALLERY_PANEL_WIDTH_MIN
} from './gallery-session.ts';
import { GalleryDetailPanel } from './lantai-detail-panel.ts';

export const STORAGE_GALLERY_VIEW_TYPE = 'lantai-storage-gallery';

const LIGHTBOX_CENTER_RATIO = 0.5;
const LIGHTBOX_MAX_SCALE = 8;
const LIGHTBOX_MIN_SCALE = 0.25;
const LIGHTBOX_WHEEL_LINE_HEIGHT = 16;
const LIGHTBOX_ZOOM_SENSITIVITY = 0.0015;
const PAGE_SIZE = 48;
const SEARCH_DEBOUNCE_MS = 250;
const SCROLL_LOAD_THRESHOLD = 300;
const CARD_VISIBLE_TAG_COUNT = 3;

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

interface GallerySortOption {
	readonly order: GallerySortOrder;
	readonly sort: GallerySortKey;
}

interface StorageGalleryViewConstructorParams {
	createGallerySource(input: CreateGallerySourceInput): Promise<GalleryDataSource>;
	createUploadStorage(
		profile: StorageProfile,
		secrets: StorageSecrets
	): Promise<ObjectStorage>;
	readonly findLocalReferences: LocalImageReferenceFinder;
	readonly findReferences: RemoteImageReferenceFinder;
	getSecret(name: string): null | string;
	readonly leaf: WorkspaceLeaf;
	pickAndUpload(params: GalleryUploadRequest): void;
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
	private readonly findLocalReferences: LocalImageReferenceFinder;
	private readonly findReferences: RemoteImageReferenceFinder;
	private readonly getSecret: (name: string) => null | string;
	private galleryProfileId: null | string = null;
	private gridEl: HTMLElement | undefined;
	private hasMore = true;
	private loadGeneration = 0;
	private loading = false;
	private loadingEl: HTMLElement | undefined;
	private layout: GalleryLayout = 'cards';
	private layoutButton: ExtraButtonComponent | undefined;
	private lastLoadError: unknown;
	private panel: GalleryDetailPanel | undefined;
	private panelEl: HTMLElement | undefined;
	private panelOpen = false;
	private panelWidth = GALLERY_PANEL_WIDTH_DEFAULT;
	private readonly pickAndUpload: (params: GalleryUploadRequest) => void;
	private readonly previewUrls = new Map<string, string>();
	private readonly loadedImages = new Map<string, GalleryImage>();
	private profileDropdown: DropdownComponent | undefined;
	private profileEl: HTMLElement | undefined;
	private providerDropdown: DropdownComponent | undefined;
	private query = '';
	private resizerEl: HTMLElement | undefined;
	private scrollEl: HTMLElement | undefined;
	private searchComponent: SearchComponent | undefined;
	private searchTimer: number | undefined;
	private selectedKey: null | string = null;
	private readonly sessionStore: ObsidianGallerySessionStore;
	private readonly settings: PluginSettings;
	private sortDropdown: DropdownComponent | undefined;
	private sortEl: HTMLElement | undefined;
	private sortKey: GallerySortKey = 'createdAt';
	private sortOrder: GallerySortOrder = 'desc';
	private source: GalleryDataSource | undefined;
	private sourceKind: GallerySourceKind = 'recent';
	private splitEl: HTMLElement | undefined;
	private uploadEl: HTMLElement | undefined;
	private readonly brokenImageHandled = new Set<string>();
	private readonly brokenImageInFlight = new Set<string>();

	public constructor(params: StorageGalleryViewConstructorParams) {
		super(params.leaf);
		this.createGallerySource = (input): Promise<GalleryDataSource> => params.createGallerySource(input);
		this.createUploadStorage = (profile, secrets): Promise<ObjectStorage> => params.createUploadStorage(profile, secrets);
		this.findLocalReferences = params.findLocalReferences;
		this.findReferences = params.findReferences;
		this.getSecret = (name): null | string => params.getSecret(name);
		this.pickAndUpload = (uploadParams): void => {
			params.pickAndUpload(uploadParams);
		};
		this.settings = params.settings;
		this.sessionStore = new ObsidianGallerySessionStore({ app: this.app });
		this.applySession(this.sessionStore.read());
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
		this.sessionStore.flush();
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
		this.searchComponent = new SearchComponent(searchEl)
			.setPlaceholder(t('gallery.searchPlaceholder'))
			.onChange((value) => {
				this.scheduleSearch(value);
			});
		this.buildSourceControls(toolbarEl);
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
		this.sortEl = controlsEl.createDiv('lantai-gallery-sort');
		this.sortDropdown = new DropdownComponent(this.sortEl).onChange((value) => {
			this.selectSort(value);
		});
		this.sortDropdown.selectEl.setAttribute('aria-label', t('gallery.sortAria'));
		this.refreshSortDropdown();
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
			this.persistSession(true);
		});
		this.splitEl = this.contentEl.createDiv('lantai-gallery-split');
		this.scrollEl = this.splitEl.createDiv('lantai-gallery-body');
		this.gridEl = this.scrollEl.createDiv('lantai-gallery-grid');
		this.updateLayout();
		this.emptyEl = this.scrollEl.createDiv('lantai-gallery-empty');
		this.loadingEl = this.scrollEl.createDiv('lantai-gallery-loading');
		this.resizerEl = this.splitEl.createDiv('lantai-gallery-resizer');
		this.panelEl = this.splitEl.createDiv('lantai-gallery-panel');
		this.panel = new GalleryDetailPanel(this.panelEl, {
			loadReferences: (image): Promise<RemoteImageReference[]> => this.loadReferences(image),
			onClose: (): void => {
				this.closePanel();
			},
			onDelete: (image): void => {
				const url = this.previewUrls.get(image.key) ?? image.url ?? '';
				this.confirmDelete(image, url).catch((error: unknown) => {
					this.showError(error);
				});
			},
			onOpenNote: (path): void => {
				this.openNote(path).catch((error: unknown) => {
					this.showError(error);
				});
			},
			onUpdated: (image): void => {
				this.patchCard(image);
			}
		});
		this.bindPanelResize();
		this.applyPanelLayout();
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
		this.registerEvent(
			this.app.workspace.on('editor-drop', (event, editor) => {
				if (event.defaultPrevented) {
					return;
				}
				const embed = interceptGalleryEditorDrop(event);
				if (embed === null) {
					return;
				}
				event.preventDefault();
				editor.replaceSelection(embed);
			})
		);
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
		const references = source.kind === 'vault'
			? await this.findLocalReferences.find(image.key)
			: await this.findReferences.find(publicUrl);
		new DeleteStorageImageModal({
			app: this.app,
			...(source.kind === 'vault'
				? { description: t('gallery.deletesVaultFile', { path: image.key }) }
				: {}),
			// 兰台是软删：公网链接 7 天后才失效，必须与 S3 的硬删文案区分（设计决策 19）。
			...(source.kind === 'lantai'
				? { description: t('gallery.deletesLanTaiFile', { name: image.name }) }
				: {}),
			file: image,
			onConfirm: async (): Promise<void> => {
				if (source !== this.source) {
					throw new Error(t('errors.galleryProfileChanged'));
				}
				this.removeCard(image.key);
				try {
					await source.delete(image);
					new Notice(t('gallery.deletedNotice'));
				} catch (error) {
					await this.reset();
					throw error;
				}
			},
			references
		}).open();
	}

	private async createActiveSource(): Promise<GalleryDataSource> {
		const kind = this.sourceKind;
		if (kind === 'vault' || kind === 'recent') {
			return this.createGallerySource({
				kind,
				profile: undefined,
				secrets: undefined
			});
		}
		// 兰台源用账号级凭证（服务地址 + API key），没有配置档下拉、也没有 AK/SK。
		if (kind === 'lantai') {
			const lanTaiProfile = this.getLanTaiProfile();
			if (!lanTaiProfile) {
				throw new Error(t('errors.lantaiProfileMissing'));
			}
			return this.createGallerySource({
				kind,
				profile: lanTaiProfile,
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
			bucketGalleryProfiles(this.settings.profiles),
			this.galleryProfileId
		);
	}

	/** 库内至多一个 lantai 配置档（设计决策 10）。 */
	private getLanTaiProfile(): StorageProfile | undefined {
		return this.settings.profiles.find((profile) => profile.provider === 'lantai');
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
		this.previewUrls.set(image.key, url);
		this.loadedImages.set(image.key, image);
		const cardEl = this.gridEl.createDiv('lantai-gallery-card');
		cardEl.dataset['objectKey'] = image.key;
		cardEl.tabIndex = 0;
		cardEl.toggleClass('is-selected', image.key === this.selectedKey);
		const imageEl = cardEl.createEl('img', {
			attr: { alt: displayTitle(image), draggable: 'false', loading: 'lazy', src: url }
		});
		imageEl.addClass('lantai-gallery-image');
		this.renderCardCaption(cardEl, image);
		cardEl.addEventListener('dblclick', () => {
			this.openLightbox(displayTitle(image), url);
		});
		cardEl.addEventListener('click', (event) => {
			if (event.detail === 1) {
				this.openDetail(image, url);
			}
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
		} else {
			this.bindCardDrag(cardEl, image, url);
		}
		cardEl.addEventListener('keydown', (event) => {
			if (event.key === 'Enter') {
				event.preventDefault();
				this.openLightbox(displayTitle(image), url);
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

	private bindCardDrag(
		cardEl: HTMLElement,
		image: GalleryImage,
		publicUrl: string
	): void {
		cardEl.draggable = true;
		cardEl.addEventListener('dragstart', (event) => {
			const data = event.dataTransfer;
			if (!data) {
				return;
			}
			const embed = formatGalleryDropEmbed({
				image,
				linkStyle: this.settings.linkStyle,
				publicUrl
			});
			data.setData('text/plain', embed);
			data.setData(GALLERY_DROP_EMBED_MIME, embed);
			data.effectAllowed = 'copy';
		});
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
				this.openDetail(image, url);
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

	private buildSourceControls(container: HTMLElement): void {
		const sourceEl = container.createDiv('lantai-gallery-source');
		const providerEl = sourceEl.createDiv('lantai-gallery-provider');
		this.providerDropdown = new DropdownComponent(providerEl).onChange((value) => {
			if (isGallerySourceKind(value)) {
				this.selectSource(value).catch((error: unknown) => {
					this.showError(error);
				});
			}
		});
		this.providerDropdown.addOption('recent', t('gallery.sourceRecent'));
		this.providerDropdown.addOption('lantai', t('gallery.sourceLanTai'));
		this.providerDropdown.addOption('vault', t('gallery.sourceVault'));
		this.providerDropdown.addOption('bucket', t('gallery.sourceBucket'));
		this.providerDropdown.selectEl.setAttribute('aria-label', t('gallery.providerAria'));
		this.updateSourceControls();
	}

	private createFileMenu(image: GalleryImage, publicUrl: string): Menu {
		return new Menu()
			.setUseNativeMenu(false)
			.addItem((item) =>
				item
					.setIcon('link')
					.setTitle(t('gallery.copyUrl'))
					.onClick(() => {
						this.copyText(publicUrl).catch((error: unknown) => {
							this.showError(error);
						});
					})
			)
			.addItem((item) =>
				item
					.setIcon('code')
					.setTitle(t('gallery.copyMarkdown'))
					.onClick(() => {
						this.copyText(this.markdownLink(image, publicUrl)).catch((error: unknown) => {
							this.showError(error);
						});
					})
			)
			.addItem((item) =>
				item
					.setIcon('pencil')
					.setTitle(t('gallery.detailMenu'))
					.onClick(() => {
						this.openDetail(image, publicUrl);
					})
			)
			.addSeparator()
			.addItem((item) =>
				item
					.setIcon('trash')
					.setTitle(t('gallery.deleteMenu'))
					.setWarning(true)
					.onClick(() => {
						this.confirmDelete(image, publicUrl).catch((error: unknown) => {
							this.showError(error);
						});
					})
			);
	}

	private openDetail(image: GalleryImage, previewUrl: string): void {
		const source = this.source;
		const panel = this.panel;
		if (source === undefined || panel === undefined) {
			return;
		}
		this.selectedKey = image.key;
		this.panelOpen = true;
		panel.show(image, source, previewUrl);
		this.highlightSelected();
		this.applyPanelLayout();
		this.persistSession(true);
	}

	private async copyText(text: string): Promise<void> {
		// eslint-disable-next-line n/no-unsupported-features/node-builtins -- desktop clipboard API
		await window.navigator.clipboard.writeText(text);
		new Notice(t('gallery.urlCopiedNotice'));
	}

	private markdownLink(image: GalleryImage, publicUrl: string): string {
		return formatGalleryDropEmbed({
			image,
			linkStyle: 'markdown',
			publicUrl
		});
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
		if (this.sourceKind === 'recent') {
			await this.reset();
			return;
		}
		await this.selectSource('recent');
	}

	private async openUpload(): Promise<void> {
		const kind = this.sourceKind;
		if (kind === 'vault') {
			return;
		}
		const profile = kind === 'lantai' ? this.getLanTaiProfile() : this.getSelectedProfile();
		if (!profile) {
			throw new Error(
				t(kind === 'lantai' ? 'errors.lantaiProfileMissing' : 'errors.noActiveStorageProfile')
			);
		}
		if (kind === 'lantai') {
			// 凭证是账号级的，由存储工厂自己从设置与 SecretStorage 读取，这里不做 AK/SK 校验。
			const storage = await this.createUploadStorage(profile, {
				accessKeyId: '',
				secretAccessKey: ''
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
			return;
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
		this.findCard(key)?.remove();
		this.previewUrls.delete(key);
		this.loadedImages.delete(key);
		if (this.selectedKey === key) {
			this.closePanel();
		}
		this.updateEmptyState();
	}

	private async reset(): Promise<boolean> {
		const generation = ++this.loadGeneration;
		this.brokenImageHandled.clear();
		this.brokenImageInFlight.clear();
		this.previewUrls.clear();
		this.loadedImages.clear();
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
			if (source.kind === 'lantai' && source.setSort !== undefined) {
				source.setSort(this.sortKey, this.sortOrder);
			}
			await this.loadMore();
			this.restoreSelectedPanel();
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
		if (!this.settings.profiles.some((profile) => profile.id === profileId && profile.provider !== 'lantai')) {
			return;
		}
		this.galleryProfileId = profileId;
		this.persistSession(true);
		this.refreshProfileDropdown();
		if (!(await this.reset())) {
			this.presentLoadFailure();
		}
	}

	private async selectSource(kind: GallerySourceKind): Promise<void> {
		if (kind === this.sourceKind) {
			return;
		}
		this.sourceKind = kind;
		this.closePanel();
		this.updateSourceControls();
		this.toggleSourceControls();
		this.persistSession(true);
		if (!(await this.reset())) {
			this.presentLoadFailure();
		}
	}

	private toggleSourceControls(): void {
		const kind = this.sourceKind;
		const isVault = kind === 'vault';
		const showProfile = kind === 'bucket';
		if (this.profileEl) {
			this.profileEl.style.display = showProfile ? '' : 'none';
		}
		if (this.sortEl) {
			this.sortEl.style.display = kind === 'lantai' ? '' : 'none';
		}
		if (this.uploadEl) {
			this.uploadEl.style.display = isVault ? 'none' : '';
		}
		this.searchComponent?.setPlaceholder(
			t(kind === 'lantai' ? 'gallery.searchPlaceholderLanTai' : 'gallery.searchPlaceholder')
		);
	}

	private refreshProfileDropdown(): void {
		if (!this.profileDropdown) {
			return;
		}
		this.profileDropdown.selectEl.empty();
		const bucketProfiles = bucketGalleryProfiles(this.settings.profiles);
		const galleryProfileId = this.galleryProfileId;
		const knownSelected = galleryProfileId !== null
			&& bucketProfiles.some((profile) => profile.id === galleryProfileId);
		if (bucketProfiles.length === 0) {
			this.profileDropdown.addOption('', t('gallery.noProfiles'));
		} else {
			if (!knownSelected) {
				this.profileDropdown.addOption('', t('gallery.selectProfile'));
			}
			for (const profile of bucketProfiles) {
				this.profileDropdown.addOption(
					profile.id,
					profile.name || t('gallery.untitledProfile')
				);
			}
		}
		this.profileDropdown
			.setValue(knownSelected ? galleryProfileId : '')
			.setDisabled(bucketProfiles.length === 0);
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

	private applySession(session: GallerySession): void {
		this.layout = session.layout;
		this.panelOpen = session.panelOpen;
		this.panelWidth = session.panelWidth;
		this.galleryProfileId = session.profileId;
		this.selectedKey = session.selectedKey;
		this.sortKey = session.sortKey;
		this.sortOrder = session.sortOrder;
		this.sourceKind = session.source;
	}

	private persistSession(immediate: boolean): void {
		const session = this.currentSession();
		if (immediate) {
			this.sessionStore.saveImmediate(session);
			return;
		}
		this.sessionStore.saveDebounced(session);
	}

	private currentSession(): GallerySession {
		return {
			layout: this.layout,
			panelOpen: this.panelOpen,
			panelWidth: this.panelWidth,
			profileId: this.galleryProfileId,
			selectedKey: this.selectedKey,
			sortKey: this.sortKey,
			sortOrder: this.sortOrder,
			source: this.sourceKind,
			version: 1
		};
	}

	private updateSourceControls(): void {
		this.providerDropdown?.setValue(this.sourceKind);
	}

	private refreshSortDropdown(): void {
		if (!this.sortDropdown) {
			return;
		}
		this.sortDropdown.selectEl.empty();
		this.sortDropdown.addOption('newest', t('gallery.sortNewest'));
		this.sortDropdown.addOption('oldest', t('gallery.sortOldest'));
		this.sortDropdown.addOption('name', t('gallery.sortName'));
		this.sortDropdown.addOption('size', t('gallery.sortSize'));
		this.sortDropdown.setValue(sortOptionId(this.sortKey, this.sortOrder));
	}

	private selectSort(optionId: string): void {
		const parsed = parseSortOption(optionId);
		this.sortKey = parsed.sort;
		this.sortOrder = parsed.order;
		this.persistSession(true);
		this.reset()
			.then((loaded) => {
				if (!loaded) {
					this.presentLoadFailure();
				}
			})
			.catch((error: unknown) => {
				this.showError(error);
			});
	}

	private bindPanelResize(): void {
		const handle = this.resizerEl;
		const panel = this.panelEl;
		if (!handle || !panel) {
			return;
		}
		handle.addEventListener('pointerdown', (event) => {
			if (event.button !== 0) {
				return;
			}
			event.preventDefault();
			const startX = event.clientX;
			const startWidth = this.panelWidth;
			const onMove = (move: PointerEvent): void => {
				const next = Math.min(
					GALLERY_PANEL_WIDTH_MAX,
					Math.max(GALLERY_PANEL_WIDTH_MIN, startWidth - (move.clientX - startX))
				);
				this.panelWidth = next;
				this.applyPanelLayout();
				this.persistSession(false);
			};
			const onUp = (): void => {
				handle.doc.removeEventListener('pointermove', onMove);
				handle.doc.removeEventListener('pointerup', onUp);
				this.sessionStore.flush();
			};
			handle.doc.addEventListener('pointermove', onMove);
			handle.doc.addEventListener('pointerup', onUp);
		});
	}

	private applyPanelLayout(): void {
		this.contentEl.toggleClass('is-panel-open', this.panelOpen);
		this.panelEl?.style.setProperty('--lantai-panel-width', `${String(this.panelWidth)}px`);
		if (this.panelEl) {
			this.panelEl.style.width = `${String(this.panelWidth)}px`;
			this.panelEl.style.display = this.panelOpen ? '' : 'none';
		}
		if (this.resizerEl) {
			this.resizerEl.style.display = this.panelOpen ? '' : 'none';
		}
	}

	private closePanel(): void {
		this.panelOpen = false;
		this.selectedKey = null;
		this.panel?.clear();
		this.highlightSelected();
		this.applyPanelLayout();
		this.persistSession(true);
	}

	private restoreSelectedPanel(): void {
		if (!this.panelOpen || this.selectedKey === null) {
			this.applyPanelLayout();
			return;
		}
		const card = this.findCard(this.selectedKey);
		if (card === undefined) {
			this.closePanel();
			return;
		}
		const image = this.loadedImages.get(this.selectedKey);
		const url = this.previewUrls.get(this.selectedKey) ?? '';
		if (image === undefined || this.source === undefined) {
			this.applyPanelLayout();
			return;
		}
		this.panel?.show(image, this.source, url);
		this.highlightSelected();
		this.applyPanelLayout();
	}

	private findCard(key: string): HTMLElement | undefined {
		for (const child of this.gridEl?.children ?? []) {
			if (child.instanceOf(HTMLElement) && child.dataset['objectKey'] === key) {
				return child;
			}
		}
		return undefined;
	}

	private async loadReferences(image: GalleryImage): Promise<RemoteImageReference[]> {
		if (image.kind === 'vault') {
			return this.findLocalReferences.find(image.key);
		}
		const url = this.previewUrls.get(image.key) ?? image.url ?? '';
		if (url === '') {
			return [];
		}
		return this.findReferences.find(url);
	}

	private async openNote(path: string): Promise<void> {
		const file = this.app.vault.getFileByPath(path);
		if (file === null) {
			return;
		}
		await this.app.workspace.getLeaf(false).openFile(file);
	}

	private patchCard(image: GalleryImage): void {
		const previous = this.loadedImages.get(image.key);
		this.loadedImages.set(image.key, previous === undefined ? image : { ...previous, ...image });
		const card = this.findCard(image.key);
		if (card === undefined) {
			return;
		}
		const caption = card.querySelector('.lantai-gallery-caption');
		caption?.remove();
		this.renderCardCaption(card, image);
	}

	private renderCardCaption(cardEl: HTMLElement, image: GalleryImage): void {
		const caption = cardEl.createDiv('lantai-gallery-caption');
		caption.createDiv({ cls: 'lantai-gallery-name', text: displayTitle(image) });
		const meta: string[] = [];
		if (image.size !== undefined) {
			meta.push(formatBytes(image.size));
		}
		if (image.timestamp !== undefined) {
			meta.push(formatGalleryDate(image.timestamp));
		}
		if (meta.length > 0) {
			caption.createDiv({ cls: 'lantai-gallery-meta', text: meta.join(' · ') });
		}
		const tags = image.tags ?? [];
		if (tags.length === 0) {
			return;
		}
		const row = caption.createDiv('lantai-gallery-tags');
		const visible = tags.slice(0, CARD_VISIBLE_TAG_COUNT);
		for (const name of visible) {
			const chip = row.createEl('button', { cls: 'lantai-gallery-tag', text: name });
			chip.addEventListener('click', (event) => {
				event.stopPropagation();
				this.filterByTag(name);
			});
		}
		if (tags.length > CARD_VISIBLE_TAG_COUNT) {
			row.createSpan({ text: `+${String(tags.length - CARD_VISIBLE_TAG_COUNT)}` });
		}
	}

	private filterByTag(name: string): void {
		const query = galleryTagSearchQuery(name);
		this.searchComponent?.setValue(query);
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
	}

	private highlightSelected(): void {
		for (const child of this.gridEl?.children ?? []) {
			if (child.instanceOf(HTMLElement)) {
				child.toggleClass('is-selected', child.dataset['objectKey'] === this.selectedKey);
			}
		}
	}
}
/* eslint-enable perfectionist/sort-classes -- lifecycle and loading steps stay in execution order. */

/** Exposed for unit tests. */
export function galleryTagSearchQuery(name: string): string {
	return `tag:${name}`;
}

/** Exposed for unit tests. */
export function getObjectFileName(objectKey: string): string {
	return objectKey.split('/').at(-1) ?? objectKey;
}

/** Exposed for unit tests. */
export function parseSortOption(optionId: string): GallerySortOption {
	if (optionId === 'oldest') {
		return { order: 'asc', sort: 'createdAt' };
	}
	if (optionId === 'name') {
		return { order: 'asc', sort: 'name' };
	}
	if (optionId === 'size') {
		return { order: 'desc', sort: 'size' };
	}
	return { order: 'desc', sort: 'createdAt' };
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

/** Exposed for unit tests. */
export function sortOptionId(sort: GallerySortKey, order: GallerySortOrder): string {
	if (sort === 'createdAt' && order === 'asc') {
		return 'oldest';
	}
	if (sort === 'name') {
		return 'name';
	}
	if (sort === 'size') {
		return 'size';
	}
	return 'newest';
}

function bucketGalleryProfiles(profiles: readonly StorageProfile[]): StorageProfile[] {
	return profiles.filter((profile) => profile.provider !== 'lantai');
}

function displayTitle(image: GalleryImage): string {
	const title = image.title?.trim();
	if (title !== undefined && title !== '') {
		return title;
	}
	return image.name;
}

function isGallerySourceKind(value: string): value is GallerySourceKind {
	return value === 'bucket' || value === 'lantai' || value === 'recent' || value === 'vault';
}
