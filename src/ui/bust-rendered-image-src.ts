interface RefreshRenderedImageSourcesOptions {
	readonly mtime?: number;
	readonly resourceUrl: string;
	readonly vaultPath: string;
}

/**
 * Always stamp a fresh `mtime` onto the resource path.
 * Obsidian `getResourcePath` may still return the pre-modifyBinary mtime;
 * reusing that URL would leave the rendered `<img>` on the stale cache entry.
 */
export function bustRenderedImageSrc(
	currentSrc: string,
	resourceUrl: string,
	mtime: number = Date.now()
): string {
	const path = imageSrcPath(resourceUrl || currentSrc);
	return `${path}?mtime=${String(mtime)}`;
}

/** Path portion of an image src (no query / hash), for matching vault files. */
export function imageSrcPath(src: string): string {
	const hash = src.indexOf('#');
	const withoutHash = hash === -1 ? src : src.slice(0, hash);
	const query = withoutHash.indexOf('?');
	return query === -1 ? withoutHash : withoutHash.slice(0, query);
}

/** Updates `<img>` elements under `root` whose src or data-path matches `vaultPath`. */
export function refreshRenderedImageSources(
	root: ParentNode,
	options: RefreshRenderedImageSourcesOptions
): number {
	const mtime = options.mtime ?? Date.now();
	let updated = 0;
	for (const image of root.querySelectorAll('img')) {
		const dataPath = image.getAttribute('data-path');
		const current = image.getAttribute('src') ?? image.src;
		const matches = (dataPath !== null && dataPath !== '' && srcMatchesVaultPath(dataPath, options.vaultPath))
			|| (current !== '' && srcMatchesVaultPath(current, options.vaultPath));
		if (!matches) {
			continue;
		}
		const next = bustRenderedImageSrc(current || options.resourceUrl, options.resourceUrl, mtime);
		image.setAttribute('src', next);
		image.src = next;
		updated += 1;
	}
	return updated;
}

export function srcMatchesVaultPath(src: string, vaultPath: string): boolean {
	const path = decodeSafely(imageSrcPath(src)).replace(/\\/g, '/');
	const needle = vaultPath.replace(/\\/g, '/').replace(/^\/+/u, '');
	if (!needle) {
		return false;
	}
	return path === needle
		|| path.endsWith(`/${needle}`)
		|| path.endsWith(needle);
}

function decodeSafely(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}
