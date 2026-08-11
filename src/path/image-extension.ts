const IMAGE_EXTENSIONS = new Set([
	'avif',
	'bmp',
	'gif',
	'ico',
	'jpeg',
	'jpg',
	'png',
	'svg',
	'webp'
]);

export function isImageExtension(ext: string): boolean {
	return IMAGE_EXTENSIONS.has(ext.trim().toLowerCase());
}

export function isImageKey(key: string): boolean {
	const dotIndex = key.lastIndexOf('.');
	return dotIndex !== -1 && isImageExtension(key.slice(dotIndex + 1));
}
