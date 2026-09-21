import {
	describe,
	expect,
	it,
	vi
} from 'vitest';

import type { RemoteImageReference } from '../../../link/remote-image-reference-finder.ts';
import type {
	GalleryDataSource,
	GalleryImage,
	GalleryManageableSource
} from '../../../storage/gallery-source.ts';

import { t } from '../../../i18n/index.ts';
import { GalleryDetailPanel } from '../lantai-detail-panel.ts';

type ManageableSource = GalleryDataSource & GalleryManageableSource;

function actionButtons(host: HTMLElement): string[] {
	const item = host.querySelector('.lantai-detail-actions');
	if (!(item instanceof HTMLElement)) {
		return [];
	}
	return [...item.querySelectorAll('button')].map((button) => button.textContent);
}

function image(overrides: Partial<GalleryImage> = {}): GalleryImage {
	return {
		description: 'old desc',
		key: 'a.webp',
		kind: 'lantai',
		name: 'a.webp',
		tags: ['风景'],
		title: '旧标题',
		...overrides
	};
}

function manageableSource(overrides: Partial<ManageableSource> = {}): ManageableSource {
	return {
		addTags: vi.fn().mockResolvedValue(undefined),
		delete: vi.fn().mockResolvedValue(undefined),
		kind: 'lantai',
		loadMore: vi.fn(),
		purge: vi.fn().mockResolvedValue(undefined),
		removeTag: vi.fn().mockResolvedValue(undefined),
		setQuery: vi.fn(),
		thumbnailUrl: vi.fn(),
		updateMetadata: vi.fn().mockResolvedValue(undefined),
		verify: vi.fn().mockResolvedValue(true),
		...overrides
	};
}

function readOnlySource(): GalleryDataSource {
	return {
		delete: vi.fn().mockResolvedValue(undefined),
		kind: 'vault',
		loadMore: vi.fn(),
		purge: vi.fn().mockResolvedValue(undefined),
		setQuery: vi.fn(),
		thumbnailUrl: vi.fn(),
		verify: vi.fn().mockResolvedValue(true)
	};
}

function titleInput(host: HTMLElement): HTMLInputElement {
	const input = host.querySelector('.lantai-detail-title input');
	if (!(input instanceof HTMLInputElement)) {
		throw new Error('expected title input');
	}
	return input;
}

describe('GalleryDetailPanel', () => {
	it('discards unsaved title when switching images', () => {
		const host = document.body.createDiv();
		const panel = new GalleryDetailPanel(host, {
			loadReferences: (): Promise<RemoteImageReference[]> => Promise.resolve([]),
			onClose: (): void => undefined,
			onDelete: (): void => undefined,
			onOpenNote: (): void => undefined,
			onUpdated: (): void => undefined
		});
		const source = manageableSource();
		panel.show(image(), source, 'https://cdn/a.webp');
		const field = titleInput(host);
		field.value = '未保存';
		field.dispatchEvent(new Event('input', { bubbles: true }));

		panel.show(image({ key: 'b.webp', name: 'b.webp', title: '下一张' }), source, 'https://cdn/b.webp');

		const values = [...host.querySelectorAll('input')].map((el) => el.value);
		expect(values).toContain('下一张');
		expect(values).not.toContain('未保存');
	});

	it('rolls tags back when addTags fails', async () => {
		const host = document.body.createDiv();
		const updated: GalleryImage[] = [];
		const panel = new GalleryDetailPanel(host, {
			loadReferences: (): Promise<RemoteImageReference[]> => Promise.resolve([]),
			onClose: (): void => undefined,
			onDelete: (): void => undefined,
			onOpenNote: (): void => undefined,
			onUpdated: (next: GalleryImage): void => {
				updated.push(next);
			}
		});
		const source = manageableSource({
			addTags: vi.fn().mockRejectedValue(new Error('nope'))
		});
		panel.show(image(), source, 'https://cdn/a.webp');

		const addInput = host.querySelector(`input[placeholder="${t('gallery.detailAddTag')}"]`);
		if (!(addInput instanceof HTMLInputElement)) {
			throw new Error('expected tag input');
		}
		addInput.value = '晨雾';
		addInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
		await vi.waitFor(() => {
			expect(updated.length).toBeGreaterThan(1);
		});

		expect(updated[0]?.tags).toEqual(['风景', '晨雾']);
		expect(updated.at(-1)?.tags).toEqual(['风景']);
		expect(host.textContent).toContain('风景');
		expect(host.textContent).not.toContain('晨雾');
	});

	it('shows a centered filename instead of a left-aligned setting name', () => {
		const host = document.body.createDiv();
		const panel = new GalleryDetailPanel(host, {
			loadReferences: (): Promise<RemoteImageReference[]> => Promise.resolve([]),
			onClose: (): void => undefined,
			onDelete: (): void => undefined,
			onOpenNote: (): void => undefined,
			onUpdated: (): void => undefined
		});
		panel.show(image({ name: 'photo.webp' }), manageableSource(), 'https://cdn/a.webp');

		const filename = host.querySelector('.lantai-detail-filename');
		expect(filename).toBeInstanceOf(HTMLInputElement);
		if (!(filename instanceof HTMLInputElement)) {
			throw new Error('expected filename input');
		}
		expect(filename.value).toBe('photo.webp');
		expect(host.querySelector('.lantai-detail-title')).not.toBeNull();
		expect(host.querySelector('.lantai-detail-filename')?.closest('.lantai-detail-title')).toBeNull();

		panel.show(
			image({ key: 'vault.png', kind: 'vault', name: 'vault.png' }),
			readOnlySource(),
			'https://cdn/vault.png'
		);
		const caption = host.querySelector('.lantai-detail-filename');
		expect(caption).toBeInstanceOf(HTMLDivElement);
		expect(caption?.textContent).toBe('vault.png');
	});

	it('puts save and delete on the same setting row', () => {
		const host = document.body.createDiv();
		const panel = new GalleryDetailPanel(host, {
			loadReferences: (): Promise<RemoteImageReference[]> => Promise.resolve([]),
			onClose: (): void => undefined,
			onDelete: (): void => undefined,
			onOpenNote: (): void => undefined,
			onUpdated: (): void => undefined
		});
		panel.show(image(), manageableSource(), 'https://cdn/a.webp');

		expect(actionButtons(host)).toEqual([t('gallery.delete'), t('settings.save')]);
	});

	it('renders backlink title and path and opens the note', async () => {
		const host = document.body.createDiv();
		const onOpenNote = vi.fn();
		const panel = new GalleryDetailPanel(host, {
			loadReferences: (): Promise<RemoteImageReference[]> => Promise.resolve([{ path: 'notes/daily.md', title: 'Daily' }]),
			onClose: (): void => undefined,
			onDelete: (): void => undefined,
			onOpenNote,
			onUpdated: (): void => undefined
		});
		panel.show(image(), manageableSource(), 'https://cdn/a.webp');

		await vi.waitFor(() => {
			expect(host.textContent).toContain('Daily');
		});
		expect(host.textContent).toContain('notes/daily.md');
		expect(host.textContent).not.toContain('Daily (notes/daily.md)');

		const link = host.querySelector('.lantai-detail-reference a');
		if (!(link instanceof HTMLAnchorElement)) {
			throw new Error('expected backlink');
		}
		link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
		expect(onOpenNote).toHaveBeenCalledTimes(1);
		expect(onOpenNote).toHaveBeenCalledWith('notes/daily.md');
	});
});
