import type { App } from 'obsidian';

import {
	Modal,
	Notice,
	Setting
} from 'obsidian';

import type {
	GalleryImage,
	GalleryManageableSource
} from '../storage/gallery-source.ts';

import { t } from '../i18n/index.ts';
import { formatBytes } from '../lantai/lantai-account.ts';

export interface OpenLanTaiDetailModalParams {
	readonly app: App;
	readonly image: GalleryImage;
	onSaved(this: void): void;
	readonly source: GalleryManageableSource;
}

/**
 * 兰台源的详情弹窗：承载 web 控制台同款的可编辑元数据与标签。
 * 与 web 的差别是按设计决策追加了「压缩」区块——插件用户最常问的就是「图为什么变小了」。
 */
class LanTaiDetailModal extends Modal {
	private description: string;
	private readonly image: GalleryImage;
	private name: string;
	private readonly onSaved: () => void;
	private readonly source: GalleryManageableSource;
	private tags: string[];
	private tagsEl: HTMLElement | undefined;
	private title: string;

	public constructor(params: OpenLanTaiDetailModalParams) {
		super(params.app);
		this.description = params.image.description ?? '';
		this.image = params.image;
		this.name = params.image.name;
		this.onSaved = params.onSaved;
		this.source = params.source;
		this.tags = [...(params.image.tags ?? [])];
		this.title = params.image.title ?? '';
	}

	public override onClose(): void {
		this.contentEl.empty();
	}

	public override onOpen(): void {
		this.setTitle(t('gallery.detailTitle'));
		const url = this.image.url;
		if (url !== undefined && url !== '') {
			this.contentEl.createEl('img', { attr: { src: url }, cls: 'lantai-detail-preview' });
		}
		new Setting(this.contentEl)
			.setName(t('gallery.detailFileName'))
			.addText((text) =>
				text.setValue(this.name).onChange((value) => {
					this.name = value;
				})
			);
		new Setting(this.contentEl)
			.setName(t('gallery.detailTitleField'))
			.addText((text) =>
				text.setValue(this.title).onChange((value) => {
					this.title = value;
				})
			);
		new Setting(this.contentEl)
			.setName(t('gallery.detailDescription'))
			.addTextArea((area) =>
				area.setValue(this.description).onChange((value) => {
					this.description = value;
				})
			);
		this.tagsEl = this.contentEl.createDiv('lantai-detail-tags');
		this.renderTags();
		this.renderTagInput();
		this.renderInfo();
		new Setting(this.contentEl)
			.addButton((button) =>
				button.setButtonText(t('gallery.detailCopyMarkdown')).onClick(() => {
					copyText(url === undefined ? this.image.key : `![](${url})`);
				})
			)
			.addButton((button) =>
				button
					.setButtonText(t('settings.save'))
					.setCta()
					.onClick(() => {
						this.save().catch((error: unknown) => {
							new Notice(errorText(error));
						});
					})
			);
	}

	private async addTag(name: string): Promise<void> {
		await this.source.addTags(this.image, [name]);
		if (!this.tags.includes(name)) {
			this.tags.push(name);
		}
		this.renderTags();
		new Notice(t('gallery.detailTagAdded', { name }));
	}

	private async removeTag(name: string): Promise<void> {
		await this.source.removeTag(this.image, name);
		this.tags = this.tags.filter((tag) => tag !== name);
		this.renderTags();
	}

	private renderInfo(): void {
		const lines: string[] = [];
		if (this.image.size !== undefined) {
			lines.push(`${t('gallery.detailSize')}: ${formatBytes(this.image.size)}`);
		}
		if (this.image.processed === true) {
			const before = this.image.originalSize === undefined
				? '—'
				: formatBytes(this.image.originalSize);
			// 设计决策 26：插件比 web 多显示「原图 → 存储」与输出格式，回答「图为什么变小了」。
			lines.push(`${t('gallery.detailCompression')}: ${before} → ${formatBytes(this.image.size ?? 0)}`);
		} else {
			lines.push(`${t('gallery.detailCompression')}: ${t('gallery.detailNotCompressed')}`);
		}
		const image = this.image.image;
		if (image !== undefined) {
			lines.push(`${t('gallery.detailDimensions')}: ${String(image.width)}×${String(image.height)} (${image.format})`);
		}
		if (lines.length === 0) {
			return;
		}
		const host = this.contentEl.createDiv('lantai-detail-info');
		for (const line of lines) {
			host.createDiv({ text: line });
		}
	}

	private renderTagInput(): void {
		new Setting(this.contentEl)
			.setName(t('gallery.detailTags'))
			.setDesc(t('gallery.detailTagsDesc'))
			.addText((text) => {
				text.setPlaceholder(t('gallery.detailAddTag'));
				text.inputEl.addEventListener('keydown', (event) => {
					if (event.key !== 'Enter') {
						return;
					}
					event.preventDefault();
					const name = text.getValue().trim();
					if (name === '') {
						return;
					}
					text.setValue('');
					this.addTag(name).catch((error: unknown) => {
						new Notice(errorText(error));
					});
				});
			});
	}

	private renderTags(): void {
		const host = this.tagsEl;
		if (host === undefined) {
			return;
		}
		host.empty();
		if (this.tags.length === 0) {
			host.createDiv({ cls: 'lantai-detail-empty-tags', text: t('gallery.detailNoTags') });
			return;
		}
		for (const name of this.tags) {
			const badge = host.createDiv({ cls: 'lantai-detail-tag', text: name });
			const remove = badge.createEl('button', { text: '×' });
			remove.setAttribute('aria-label', t('gallery.detailRemoveTag', { name }));
			remove.addEventListener('click', () => {
				this.removeTag(name).catch((error: unknown) => {
					new Notice(errorText(error));
				});
			});
		}
	}

	private async save(): Promise<void> {
		await this.source.updateMetadata(this.image, {
			description: this.description,
			name: this.name,
			title: this.title
		});
		new Notice(t('gallery.detailSaved'));
		this.onSaved();
		this.close();
	}
}

/** 打开兰台附件详情弹窗（重命名/标题/描述/标签 + 压缩信息）。 */
export function openLanTaiDetailModal(params: OpenLanTaiDetailModalParams): void {
	new LanTaiDetailModal(params).open();
}

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
