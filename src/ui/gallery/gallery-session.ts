import type { GallerySourceKind } from '../../storage/gallery-source.ts';
import type {
	GallerySortKey,
	GallerySortOrder
} from '../../storage/object-storage.ts';

export const GALLERY_SESSION_KEY = 'lantai-gallery-session';
export const GALLERY_SESSION_VERSION = 1;
export const GALLERY_PANEL_WIDTH_DEFAULT = 380;
export const GALLERY_PANEL_WIDTH_MAX = 620;
export const GALLERY_PANEL_WIDTH_MIN = 300;
export const GALLERY_SESSION_DEBOUNCE_MS = 250;
const DATE_PART_PAD = 2;

export type GalleryLayout = 'cards' | 'masonry';

export interface GallerySession {
	readonly layout: GalleryLayout;
	readonly panelOpen: boolean;
	readonly panelWidth: number;
	readonly profileId: null | string;
	readonly selectedKey: null | string;
	readonly sortKey: GallerySortKey;
	readonly sortOrder: GallerySortOrder;
	readonly source: GallerySourceKind;
	readonly version: typeof GALLERY_SESSION_VERSION;
}

export const DEFAULT_GALLERY_SESSION: GallerySession = {
	layout: 'cards',
	panelOpen: false,
	panelWidth: GALLERY_PANEL_WIDTH_DEFAULT,
	profileId: null,
	selectedKey: null,
	sortKey: 'createdAt',
	sortOrder: 'desc',
	source: 'recent',
	version: GALLERY_SESSION_VERSION
};

export interface GallerySessionLoadResult {
	readonly reset: boolean;
	readonly session: GallerySession;
}

export function formatGalleryDate(timestamp: number): string {
	const date = new Date(timestamp);
	if (Number.isNaN(date.getTime())) {
		return '—';
	}
	return `${String(date.getFullYear())}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

export function gallerySessionOrDefault(raw: unknown): GallerySessionLoadResult {
	const session = parseGallerySession(raw);
	if (session === null) {
		return { reset: true, session: DEFAULT_GALLERY_SESSION };
	}
	return { reset: false, session };
}

/**
 * 校验整份会话 blob。任一字段不合法返回 null，由调用方丢弃并写入默认值。
 */
export function parseGallerySession(raw: unknown): GallerySession | null {
	const value = unwrapRaw(raw);
	if (!isRecord(value) || value['version'] !== GALLERY_SESSION_VERSION) {
		return null;
	}
	const source = value['source'];
	const layout = value['layout'];
	const sortKey = value['sortKey'];
	const sortOrder = value['sortOrder'];
	const panelWidth = value['panelWidth'];
	const profileId = value['profileId'];
	const selectedKey = value['selectedKey'];
	if (!isSource(source) || !isLayout(layout) || !isSortKey(sortKey) || !isSortOrder(sortOrder)) {
		return null;
	}
	if (typeof panelWidth !== 'number' || !Number.isFinite(panelWidth)) {
		return null;
	}
	if (panelWidth < GALLERY_PANEL_WIDTH_MIN || panelWidth > GALLERY_PANEL_WIDTH_MAX) {
		return null;
	}
	if (!isNullableString(profileId) || !isNullableString(selectedKey)) {
		return null;
	}
	if (typeof value['panelOpen'] !== 'boolean') {
		return null;
	}
	return {
		layout,
		panelOpen: value['panelOpen'],
		panelWidth,
		profileId,
		selectedKey,
		sortKey,
		sortOrder,
		source,
		version: GALLERY_SESSION_VERSION
	};
}

function isLayout(value: unknown): value is GalleryLayout {
	return value === 'cards' || value === 'masonry';
}

function isNullableString(value: unknown): value is null | string {
	return value === null || typeof value === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isSortKey(value: unknown): value is GallerySortKey {
	return value === 'createdAt' || value === 'name' || value === 'size';
}

function isSortOrder(value: unknown): value is GallerySortOrder {
	return value === 'asc' || value === 'desc';
}

function isSource(value: unknown): value is GallerySourceKind {
	return value === 'bucket' || value === 'lantai' || value === 'recent' || value === 'vault';
}

function padDatePart(value: number): string {
	return String(value).padStart(DATE_PART_PAD, '0');
}

function unwrapRaw(raw: unknown): unknown {
	if (typeof raw !== 'string') {
		return raw;
	}
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
}
