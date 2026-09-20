const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
	bmp: 'image/bmp',
	gif: 'image/gif',
	jpeg: 'image/jpeg',
	jpg: 'image/jpeg',
	png: 'image/png',
	svg: 'image/svg+xml',
	webp: 'image/webp'
};

/** 依扩展名猜 Content-Type；未知扩展名回落到 `application/octet-stream`。 */
export function contentTypeForObjectKey(objectKey: string): string {
	const dot = objectKey.lastIndexOf('.');
	const extension = dot === -1 ? '' : objectKey.slice(dot + 1).toLowerCase();
	return MIME_BY_EXTENSION[extension] ?? 'application/octet-stream';
}
