import type {
	ImageRef,
	ImageTarget
} from '../link/image-ref.ts';

export type { ImageTarget } from '../link/image-ref.ts';

export type ImageMenuItemKey =
	| 'copy'
	| 'copyPath'
	| 'deleteFile'
	| 'download'
	| 'layout'
	| 'localize'
	| 'move'
	| 'openInNewTab'
	| 'openInNewTabGroup'
	| 'openInNewWindow'
	| 'openLink'
	| 'openWithDefaultApp'
	| 'remove'
	| 'rename'
	| 'replace'
	| 'resetSize'
	| 'share'
	| 'showInFileList'
	| 'showInFolder'
	| 'star'
	| 'upload';

interface ImageMenuCapabilities {
	readonly copy: boolean;
	readonly copyAbsolutePath: boolean;
	readonly copyPath: boolean;
	readonly deleteFile: boolean;
	readonly download: boolean;
	readonly layout: boolean;
	readonly localize: boolean;
	readonly move: boolean;
	readonly openLink: boolean;
	readonly openLocal: boolean;
	readonly openTab: boolean;
	readonly openWindow: boolean;
	readonly remove: boolean;
	readonly rename: boolean;
	readonly replace: boolean;
	readonly resetSize: boolean;
	readonly share: boolean;
	readonly star: boolean;
	readonly upload: boolean;
}

const IMAGE_MENU_GROUPS: readonly (readonly ImageMenuItemKey[])[] = [
	['copy'],
	['upload', 'localize', 'download'],
	['replace', 'resetSize'],
	['openInNewTab', 'openInNewTabGroup', 'openInNewWindow'],
	['rename', 'move', 'star'],
	['openWithDefaultApp', 'showInFolder', 'showInFileList'],
	['copyPath', 'layout'],
	['remove', 'deleteFile']
];

const MOBILE_IMAGE_MENU_GROUPS: readonly (readonly ImageMenuItemKey[])[] = [
	['upload', 'localize', 'download'],
	['copy'],
	['replace', 'resetSize'],
	['openLink', 'openInNewTab'],
	['rename', 'move', 'star'],
	['share'],
	['copyPath', 'layout'],
	['remove', 'deleteFile']
];

const IMAGE_MENU_ITEM_CAPABILITY: Record<ImageMenuItemKey, keyof ImageMenuCapabilities> = {
	copy: 'copy',
	copyPath: 'copyPath',
	deleteFile: 'deleteFile',
	download: 'download',
	layout: 'layout',
	localize: 'localize',
	move: 'move',
	openInNewTab: 'openTab',
	openInNewTabGroup: 'openTab',
	openInNewWindow: 'openWindow',
	openLink: 'openLink',
	openWithDefaultApp: 'openLocal',
	remove: 'remove',
	rename: 'rename',
	replace: 'replace',
	resetSize: 'resetSize',
	share: 'share',
	showInFileList: 'openLocal',
	showInFolder: 'openLocal',
	star: 'star',
	upload: 'upload'
};

export interface ImageSourceRange {
	readonly end: number;
	readonly precise?: boolean;
	readonly start: number;
}

export interface MenuPlatformInput {
	readonly canShare?: boolean;
	readonly isMobile: boolean;
}

export interface RenderedImageIdentity {
	readonly kind: 'local' | 'remote';
	readonly target: string;
}

interface MenuCapabilitiesInput {
	readonly identity: RenderedImageIdentity;
	readonly platform?: MenuPlatformInput;
	readonly ref: ImageRef | null;
}

interface PreciseImageOffsetInput {
	readonly coordinatePosition: null | number;
	readonly domPosition: null | number;
	readonly refs: readonly Pick<ImageRef, 'end' | 'start'>[];
}

interface VisibleImageMenuGroupsOptions {
	readonly isMobile?: boolean;
}

export function findRenderedImageRef(
	refs: readonly ImageRef[],
	image: HTMLImageElement,
	root: ParentNode = image.ownerDocument,
	sourceRange?: ImageSourceRange,
	treatLoopbackAsLocal = false
): ImageRef | null {
	const identity = readRenderedImageIdentity(image, treatLoopbackAsLocal);
	if (!identity) {
		return null;
	}

	const matches = refs.filter((ref) => identityMatchesRef(identity, ref));
	if (matches.length === 0) {
		return null;
	}
	if (matches.length === 1) {
		return matches[0] ?? null;
	}

	let candidates = matches;
	if (sourceRange) {
		const rangedMatches = matches.filter(
			(ref) =>
				sourceRange.precise
					? ref.start <= sourceRange.start && ref.end >= sourceRange.end
					: ref.start < sourceRange.end && ref.end > sourceRange.start
		);
		if (rangedMatches.length === 1) {
			return rangedMatches[0] ?? null;
		}
		if (rangedMatches.length > 1) {
			candidates = rangedMatches;
		}
		// Non-overlapping ranges fall through to occurrence matching instead of failing hard.
	}

	return resolveByRenderedOccurrence(candidates, image, root, treatLoopbackAsLocal);
}

/** Exposed for unit tests. */
export function identityMatchesRef(
	identity: RenderedImageIdentity,
	ref: ImageRef
): boolean {
	if (ref.isRemote) {
		const target = decodeSafely(ref.target);
		const value = decodeSafely(identity.target);
		return identity.kind === 'remote'
			&& (value === target || value.startsWith(target));
	}

	if (identity.kind !== 'local') {
		return false;
	}

	const target = normalizeLocalPath(ref.target);
	const value = normalizeLocalPath(identity.target);
	return value === target
		|| value.endsWith(`/${target}`)
		|| basename(value) === basename(target);
}

export function lineRangeFromElement(
	image: HTMLImageElement,
	content: string
): ImageSourceRange | undefined {
	const host = image.closest<HTMLElement>('[data-line]');
	const line = Number(host?.dataset['line']);
	if (!Number.isInteger(line) || line < 0) {
		return undefined;
	}
	const lines = content.split('\n');
	const start = lines.slice(0, line).reduce((offset, value) => offset + value.length + 1, 0);
	return { end: start + (lines[line]?.length ?? 0), start };
}

export function menuCapabilities(input: MenuCapabilitiesInput): ImageMenuCapabilities {
	const ref = input.ref;
	const hasRef = ref !== null;
	const isRemote = input.identity.kind === 'remote';
	const isLocal = !isRemote;
	const hasSize = hasRef && ref.decorations.some(isSizeDecoration);
	const isMobile = input.platform?.isMobile === true;
	const canShare = input.platform?.canShare === true;
	return {
		copy: true,
		copyAbsolutePath: isLocal && !isMobile,
		copyPath: isLocal,
		deleteFile: isLocal,
		download: true,
		layout: isMobile ? hasRef : true,
		localize: hasRef && ref.isRemote,
		move: isLocal,
		openLink: isMobile,
		openLocal: isLocal && !isMobile,
		openTab: isLocal,
		openWindow: isLocal && !isMobile,
		remove: hasRef,
		rename: isLocal,
		replace: isLocal,
		resetSize: hasSize,
		share: isMobile && canShare,
		star: isLocal,
		upload: hasRef && !ref.isRemote
	};
}

export function readRenderedImageIdentity(
	image: HTMLImageElement,
	treatLoopbackAsLocal = false
): null | RenderedImageIdentity {
	const dataPath = decodeSafely(image.getAttribute('data-path') ?? '');
	if (dataPath) {
		return { kind: 'local', target: dataPath };
	}

	for (const raw of [image.getAttribute('src'), image.currentSrc]) {
		const value = decodeSafely(raw ?? '');
		if (!value) {
			continue;
		}
		if (isRemoteUrl(value, treatLoopbackAsLocal)) {
			return { kind: 'remote', target: value };
		}
		return { kind: 'local', target: value };
	}

	return null;
}

export function selectPreciseImageOffset(input: PreciseImageOffsetInput): null | number {
	const { coordinatePosition, domPosition, refs } = input;
	if (
		coordinatePosition !== null
		&& refs.some((ref) => ref.start <= coordinatePosition && ref.end >= coordinatePosition)
	) {
		return coordinatePosition;
	}
	return domPosition;
}

export function toImageTarget(
	identity: RenderedImageIdentity,
	ref: ImageRef | null
): ImageTarget {
	if (ref) {
		return {
			isRemote: ref.isRemote,
			target: ref.isRemote ? ref.target : decodeSafely(ref.target)
		};
	}
	return {
		isRemote: identity.kind === 'remote',
		target: identityTargetForActions(identity)
	};
}

export function visibleImageMenuGroups(
	capabilities: ImageMenuCapabilities,
	options?: VisibleImageMenuGroupsOptions
): ImageMenuItemKey[][] {
	const groups = options?.isMobile === true ? MOBILE_IMAGE_MENU_GROUPS : IMAGE_MENU_GROUPS;
	return groups
		.map((group) => group.filter((item) => capabilities[IMAGE_MENU_ITEM_CAPABILITY[item]]))
		.filter((group) => group.length > 0);
}

function basename(path: string): string {
	const normalized = normalizeLocalPath(path);
	const parts = normalized.split('/');
	return parts[parts.length - 1] ?? normalized;
}

function decodeSafely(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

function identityTargetForActions(identity: RenderedImageIdentity): string {
	if (identity.kind === 'remote') {
		return identity.target;
	}
	return normalizeLocalPath(identity.target);
}

function isLoopbackOrDeviceLocalUrl(value: string): boolean {
	if (/^(?:app|blob|capacitor|file):/i.test(value)) {
		return true;
	}
	try {
		const url = new URL(value);
		if (url.protocol !== 'http:' && url.protocol !== 'https:') {
			return false;
		}
		const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
		return host === 'localhost' || host === '127.0.0.1' || host === '::1';
	} catch {
		return false;
	}
}

function isMarkdownViewRoot(element: Element): boolean {
	return element.classList.contains('markdown-source-view')
		|| element.classList.contains('cm-editor');
}

function isRemoteUrl(value: string, treatLoopbackAsLocal = false): boolean {
	if (treatLoopbackAsLocal && isLoopbackOrDeviceLocalUrl(value)) {
		return false;
	}
	return /^https?:\/\//i.test(value);
}

function isSizeDecoration(value: string): boolean {
	return /^\d+$/.test(value) || /^\d+x\d+$/i.test(value);
}

function matchingRenderedImages(
	scope: ParentNode,
	sample: ImageRef,
	treatLoopbackAsLocal = false
): HTMLImageElement[] {
	return [...scope.querySelectorAll<HTMLImageElement>('img')].filter((candidate) => {
		const candidateIdentity = readRenderedImageIdentity(candidate, treatLoopbackAsLocal);
		return candidateIdentity !== null && identityMatchesRef(candidateIdentity, sample);
	});
}

function normalizeLocalPath(value: string): string {
	let path = decodeSafely(value);
	path = path.replace(/^app:\/\/[^/]+\/[^/]+\//, '');
	path = path.split(/[?#]/u, 1)[0] ?? path;
	return path.replace(/\\/g, '/');
}

function occurrenceScopes(root: ParentNode, image: HTMLImageElement): ParentNode[] {
	const scopes: ParentNode[] = [];
	const seen = new Set<ParentNode>();

	function add(node: null | ParentNode | undefined): void {
		if (!node || seen.has(node)) {
			return;
		}
		seen.add(node);
		scopes.push(node);
	}

	let current: Element | null = image.parentElement;
	while (current) {
		add(current);
		if (isMarkdownViewRoot(current)) {
			break;
		}
		current = current.parentElement;
	}

	add(root);
	if ('querySelectorAll' in root) {
		for (const selector of ['.markdown-source-view', '.cm-editor']) {
			for (const candidate of root.querySelectorAll(selector)) {
				if (candidate.contains(image)) {
					add(candidate);
				}
			}
		}
	}

	let ancestor: Element | null = root.instanceOf(Element) ? root.parentElement : null;
	while (ancestor) {
		add(ancestor);
		if (isMarkdownViewRoot(ancestor)) {
			break;
		}
		ancestor = ancestor.parentElement;
	}

	return scopes;
}

function resolveByRenderedOccurrence(
	candidates: readonly ImageRef[],
	image: HTMLImageElement,
	root: ParentNode,
	treatLoopbackAsLocal = false
): ImageRef | null {
	const firstCandidate = candidates[0];
	if (!firstCandidate) {
		return null;
	}

	for (const scope of occurrenceScopes(root, image)) {
		const renderedMatches = matchingRenderedImages(scope, firstCandidate, treatLoopbackAsLocal);
		if (renderedMatches.length !== candidates.length) {
			continue;
		}
		const occurrence = renderedMatches.indexOf(image);
		if (occurrence < 0) {
			continue;
		}
		return candidates[occurrence] ?? null;
	}

	return null;
}
