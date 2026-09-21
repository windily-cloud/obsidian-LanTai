import type { App } from 'obsidian';

import type { GallerySession } from '../../ui/gallery/gallery-session.ts';

import {
	GALLERY_SESSION_DEBOUNCE_MS,
	GALLERY_SESSION_KEY,
	gallerySessionOrDefault
} from '../../ui/gallery/gallery-session.ts';

interface ObsidianGallerySessionStoreConstructorParams {
	readonly app: App;
}

/**
 * 画廊高频 UI 状态：单一 localStorage key。内存是真源，磁盘是滞后副本。
 */
export class ObsidianGallerySessionStore {
	private readonly app: App;
	private debounceTimer: number | undefined;
	private readonly debounceTimerWin: Window;
	private session: GallerySession;

	public constructor(params: ObsidianGallerySessionStoreConstructorParams) {
		this.app = params.app;
		this.debounceTimerWin = window;
		const loaded = gallerySessionOrDefault(this.app.loadLocalStorage(GALLERY_SESSION_KEY));
		this.session = loaded.session;
		if (loaded.reset) {
			this.write(this.session);
		}
	}

	public flush(): void {
		this.clearTimer();
		this.write(this.session);
	}

	public read(): GallerySession {
		return this.session;
	}

	public saveDebounced(session: GallerySession): void {
		this.session = session;
		this.clearTimer();
		this.debounceTimer = this.debounceTimerWin.setTimeout(() => {
			this.debounceTimer = undefined;
			this.write(this.session);
		}, GALLERY_SESSION_DEBOUNCE_MS);
	}

	public saveImmediate(session: GallerySession): void {
		this.session = session;
		this.clearTimer();
		this.write(session);
	}

	private clearTimer(): void {
		if (this.debounceTimer === undefined) {
			return;
		}
		this.debounceTimerWin.clearTimeout(this.debounceTimer);
		this.debounceTimer = undefined;
	}

	private write(session: GallerySession): void {
		this.app.saveLocalStorage(GALLERY_SESSION_KEY, session);
	}
}
