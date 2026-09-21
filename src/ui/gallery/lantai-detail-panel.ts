import {
	ExtraButtonComponent,
	Notice,
	Setting
} from 'obsidian';

import type { RemoteImageReference } from '../../link/remote-image-reference-finder.ts';
import type {
	GalleryDataSource,
	GalleryImage,
	GalleryManageableSource
} from '../../storage/gallery-source.ts';

import { t } from '../../i18n/index.ts';
import { formatBytes } from '../../lantai/lantai-account.ts';
import { isManageableSource } from '../../storage/gallery-source.ts';
import { formatGalleryDate } from './gallery-session.ts';

interface GalleryDetailInfoRow {
	readonly name: string;
	readonly value: string;
}

interface GalleryDetailPanelConstructorOptions {
	loadReferences(image: GalleryImage): Promise<RemoteImageReference[]>;
	onClose(): void;
	onDelete(image: GalleryImage): void;
	onOpenNote(path: string): void;
	onUpdated(image: GalleryImage): void;
}

/**
 * 画廊右侧详情分栏。兰台源可编辑；其它源只读。引用懒加载。
 */
/* eslint-disable perfectionist/sort-classes -- render then mutate in reading order. */
export class GalleryDetailPanel {
	private description = '';
	private image: GalleryImage | undefined;
	private name = '';
	private readonly params: GalleryDetailPanelConstructorOptions;
	private previewUrl = '';
	private source: GalleryDataSource | undefined;
	private tags: string[] = [];
	private tagsEl: HTMLElement | undefined;
	private title = '';

	public constructor(
		private readonly host: HTMLElement,
		params: GalleryDetailPanelConstructorOptions
	) {
		this.params = params;
	}

	public clear(): void {
		this.image = undefined;
		this.source = undefined;
		this.host.empty();
	}

	public show(image: GalleryImage, source: GalleryDataSource, previewUrl: string): void {
		this.image = image;
		this.source = source;
		this.previewUrl = previewUrl;
		this.description = image.description ?? '';
		this.name = image.name;
		this.tags = [...(image.tags ?? [])];
		this.title = image.title ?? '';
		this.render();
	}

	private currentImage(): GalleryImage {
		const image = this.image;
		if (image === undefined) {
			throw new Error('detail panel has no image');
		}
		return image;
	}

	private manageable(): GalleryManageableSource | undefined {
		const source = this.source;
		if (source === undefined || !isManageableSource(source)) {
			return undefined;
		}
		return source;
	}

	private render(): void {
		const image = this.currentImage();
		this.host.empty();
		this.host.addClass('lantai-detail-panel');
		this.renderHeader();
		this.renderPreview();
		this.renderInfo();
		new Setting(this.host)
			.setName(t('gallery.detailLink'))
			.addButton((button) =>
				button.setButtonText(t('gallery.copyUrl')).onClick(() => {
					copyText(this.previewUrl === '' ? image.key : this.previewUrl);
				})
			)
			.addButton((button) =>
				button.setButtonText(t('gallery.detailCopyMarkdown')).onClick(() => {
					copyText(this.previewUrl === '' ? image.key : `![](${this.previewUrl})`);
				})
			);
		const manageable = this.manageable();
		if (manageable !== undefined) {
			this.renderEditable(manageable);
		}
		this.renderActions(manageable);
		this.renderReferences();
	}

	private renderHeader(): void {
		new Setting(this.host)
			.setName(t('gallery.detailTitle'))
			.setHeading()
			.setClass('lantai-detail-heading')
			.addExtraButton((button) => {
				button
					.setIcon('x')
					.setTooltip(t('gallery.closePanel'))
					.onClick(() => {
						this.params.onClose();
					});
			});
	}

	private renderPreview(): void {
		const image = this.currentImage();
		const block = this.host.createDiv('lantai-detail-preview-block');
		if (this.previewUrl !== '') {
			block.createEl('img', {
				attr: { alt: image.name, src: this.previewUrl },
				cls: 'lantai-detail-preview'
			});
		}
		this.renderFilename(block);
	}

	private renderFilename(host: HTMLElement): void {
		if (this.manageable() === undefined) {
			host.createDiv({ cls: 'lantai-detail-filename', text: this.name });
			return;
		}
		const input = host.createEl('input', {
			attr: {
				'aria-label': t('gallery.detailFileName'),
				'spellcheck': 'false',
				'type': 'text'
			},
			cls: 'lantai-detail-filename'
		});
		input.value = this.name;
		input.addEventListener('input', () => {
			this.name = input.value;
		});
	}

	private renderInfo(): void {
		const image = this.currentImage();
		const rows: GalleryDetailInfoRow[] = [];
		if (image.size !== undefined) {
			rows.push({ name: t('gallery.detailSize'), value: formatBytes(image.size) });
		}
		if (image.timestamp !== undefined) {
			rows.push({
				name: t('gallery.detailCreatedAt'),
				value: formatGalleryDate(image.timestamp)
			});
		}
		if (this.manageable() !== undefined) {
			if (image.processed === true) {
				const before = image.originalSize === undefined ? '—' : formatBytes(image.originalSize);
				rows.push({
					name: t('gallery.detailCompression'),
					value: `${before} → ${formatBytes(image.size ?? 0)}`
				});
			} else {
				rows.push({
					name: t('gallery.detailCompression'),
					value: t('gallery.detailNotCompressed')
				});
			}
			const meta = image.image;
			if (meta !== undefined) {
				rows.push({
					name: t('gallery.detailDimensions'),
					value: `${String(meta.width)}×${String(meta.height)} (${meta.format})`
				});
			}
		}
		for (const row of rows) {
			const setting = new Setting(this.host)
				.setName(row.name)
				.setClass('lantai-detail-meta');
			setting.controlEl.createSpan({
				cls: 'lantai-detail-meta-value',
				text: row.value
			});
		}
	}

	private renderEditable(source: GalleryManageableSource): void {
		new Setting(this.host)
			.setName(t('gallery.detailTitleField'))
			.setClass('lantai-detail-title')
			.addText((text) =>
				text.setValue(this.title).onChange((value) => {
					this.title = value;
				})
			);
		new Setting(this.host)
			.setName(t('gallery.detailDescription'))
			.setClass('lantai-detail-description')
			.addTextArea((area) =>
				area.setValue(this.description).onChange((value) => {
					this.description = value;
				})
			);
		this.renderTagsSetting(source);
	}

	private renderTagsSetting(source: GalleryManageableSource): void {
		const tagsSetting = new Setting(this.host)
			.setName(t('gallery.detailTags'))
			.setClass('lantai-detail-tags-setting')
			.setDesc(t('gallery.detailTagsDesc'))
			.addText((text) => {
				text.setPlaceholder(t('gallery.detailAddTag'));
				text.inputEl.addEventListener('keydown', (event) => {
					if (event.key !== 'Enter') {
						return;
					}
					event.preventDefault();
					const name = text.inputEl.value.trim();
					if (name === '') {
						return;
					}
					text.setValue('');
					this.addTag(source, name).catch((error: unknown) => {
						new Notice(errorText(error));
					});
				});
			});
		this.tagsEl = tagsSetting.infoEl.createDiv('lantai-detail-tags');
		this.renderTags();
	}

	private renderActions(source: GalleryManageableSource | undefined): void {
		const image = this.currentImage();
		const actions = new Setting(this.host).setClass('lantai-detail-actions');
		actions.addButton((button) =>
			button
				.setButtonText(t('gallery.delete'))
				.setWarning()
				.onClick(() => {
					this.params.onDelete(image);
				})
		);
		if (source === undefined) {
			return;
		}
		actions.addButton((button) =>
			button
				.setButtonText(t('settings.save'))
				.setCta()
				.onClick(() => {
					this.save(source).catch((error: unknown) => {
						new Notice(errorText(error));
					});
				})
		);
	}

	private renderReferences(): void {
		const box = this.host.createDiv('lantai-detail-references');
		const heading = new Setting(box)
			.setName(t('gallery.detailBacklinks'))
			.setHeading();
		const body = box.createDiv('lantai-detail-references-body');
		body.createDiv({
			cls: 'setting-item-description',
			text: t('gallery.detailReferencesLoading')
		});
		const image = this.currentImage();
		this.params.loadReferences(image).then(
			(references) => {
				if (this.image?.key !== image.key) {
					return;
				}
				body.empty();
				if (references.length === 0) {
					heading.setDesc(t('gallery.detailNoReferences'));
					return;
				}
				heading.setName(t('gallery.referencedBy', { count: references.length }));
				for (const reference of references) {
					this.renderReference(body, reference);
				}
			},
			() => {
				if (this.image?.key !== image.key) {
					return;
				}
				body.empty();
				heading.setDesc(t('errors.imageActionFailed'));
			}
		);
	}

	private renderReference(host: HTMLElement, reference: RemoteImageReference): void {
		const row = new Setting(host)
			.setDesc(reference.path)
			.setClass('lantai-detail-reference');
		row.nameEl.empty();
		const link = row.nameEl.createEl('a', { text: reference.title });
		link.href = '#';
		link.addEventListener('click', (event) => {
			event.preventDefault();
		});
		row.settingEl.addEventListener('click', (event) => {
			event.preventDefault();
			this.params.onOpenNote(reference.path);
		});
	}

	private renderTags(): void {
		const host = this.tagsEl;
		if (host === undefined) {
			return;
		}
		host.empty();
		for (const name of this.tags) {
			const badge = host.createDiv({ cls: 'lantai-detail-tag', text: name });
			new ExtraButtonComponent(badge)
				.setIcon('x')
				.setTooltip(t('gallery.detailRemoveTag', { name }))
				.onClick(() => {
					this.removeTag(name).catch((error: unknown) => {
						new Notice(errorText(error));
					});
				});
		}
	}

	private async addTag(source: GalleryManageableSource, name: string): Promise<void> {
		const image = this.currentImage();
		const previous = [...this.tags];
		if (!this.tags.includes(name)) {
			this.tags.push(name);
		}
		this.renderTags();
		this.params.onUpdated({ ...image, tags: [...this.tags] });
		try {
			await source.addTags(image, [name]);
			new Notice(t('gallery.detailTagAdded', { name }));
		} catch (error) {
			this.tags = previous;
			this.renderTags();
			this.params.onUpdated({ ...image, tags: previous });
			throw error;
		}
	}

	private async removeTag(name: string): Promise<void> {
		const source = this.manageable();
		const image = this.currentImage();
		if (source === undefined) {
			return;
		}
		const previous = [...this.tags];
		this.tags = this.tags.filter((tag) => tag !== name);
		this.renderTags();
		this.params.onUpdated({ ...image, tags: [...this.tags] });
		try {
			await source.removeTag(image, name);
		} catch (error) {
			this.tags = previous;
			this.renderTags();
			this.params.onUpdated({ ...image, tags: previous });
			throw error;
		}
	}

	private async save(source: GalleryManageableSource): Promise<void> {
		const image = this.currentImage();
		const next = {
			...image,
			description: this.description,
			name: this.name,
			title: this.title
		};
		this.image = next;
		this.params.onUpdated(next);
		try {
			await source.updateMetadata(image, {
				description: this.description,
				name: this.name,
				title: this.title
			});
			new Notice(t('gallery.detailSaved'));
		} catch (error) {
			this.image = image;
			this.params.onUpdated(image);
			throw error;
		}
	}
}
/* eslint-enable perfectionist/sort-classes -- render then mutate in reading order. */

function copyText(text: string): void {
	// eslint-disable-next-line n/no-unsupported-features/node-builtins -- Obsidian renderer provides navigator.clipboard
	navigator.clipboard.writeText(text).then(
		() => {
			new Notice(t('gallery.urlCopiedNotice'));
		},
		() => {
			new Notice(t('errors.imageActionFailed'));
		}
	);
}

function errorText(error: unknown): string {
	return error instanceof Error ? error.message : t('errors.imageActionFailed');
}
