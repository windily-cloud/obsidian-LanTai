const IMAGE_EXTENSIONS = new Set([
	'avif',
	'bmp',
	'gif',
	'jpeg',
	'jpg',
	'png',
	'svg',
	'webp'
]);

export function isImageExtension(ext: string): boolean {
	return IMAGE_EXTENSIONS.has(ext.trim().toLowerCase());
}
