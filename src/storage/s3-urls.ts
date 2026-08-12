import { t } from '../i18n/index.ts';

export interface BuildListObjectsUrlOptions {
	readonly cursor?: string;
	readonly limit?: number;
	readonly prefix?: string;
}

/** Minimal connection shape needed to derive request URLs. */
export interface S3UrlContext {
	readonly bucket: string;
	readonly endpoint: string;
	readonly forcePathStyle: boolean;
}

const HEX_RADIX = 16;

/** Base URL addressing the bucket itself (path-style or virtual-hosted). */
export function buildBucketUrl(context: S3UrlContext): string {
	const endpoint = context.endpoint.endsWith('/')
		? context.endpoint.slice(0, -1)
		: context.endpoint;
	if (context.forcePathStyle) {
		return `${endpoint}/${encodeURIComponent(context.bucket)}`;
	}
	const origin = new URL(endpoint);
	return `${origin.protocol}//${context.bucket}.${origin.host}`;
}

export function buildListObjectsUrl(context: S3UrlContext, options: BuildListObjectsUrlOptions): string {
	const url = new URL(buildBucketUrl(context));
	url.searchParams.set('list-type', '2');
	if (options.limit !== undefined) {
		url.searchParams.set('max-keys', String(options.limit));
	}
	if (options.cursor) {
		url.searchParams.set('continuation-token', options.cursor);
	}
	if (options.prefix !== undefined && options.prefix !== '') {
		url.searchParams.set('prefix', options.prefix);
	}
	return url.toString();
}

export function buildObjectUrl(context: S3UrlContext, key: string): string {
	return `${buildBucketUrl(context)}/${encodeObjectKey(key)}`;
}

/** Path-encodes an object key segment by segment for signed S3 requests. */
export function encodeObjectKey(key: string): string {
	return key
		.split('/')
		.map((segment) => {
			if (segment === '.' || segment === '..') {
				throw new Error(t('errors.invalidObjectKey', { key }));
			}
			return encodeRfc3986Segment(segment);
		})
		.join('/');
}

/** Public (unsigned) URL for an object; dot segments are double-encoded so CDNs keep them literal. */
export function joinPublicUrl(publicBaseUrl: string, key: string): string {
	const base = publicBaseUrl.endsWith('/') ? publicBaseUrl.slice(0, -1) : publicBaseUrl;
	const path = key
		.split('/')
		.map((segment) => {
			if (segment === '.') {
				return '%252E';
			}
			if (segment === '..') {
				return '%252E%252E';
			}
			return encodeRfc3986Segment(segment);
		})
		.join('/');
	return `${base}/${path}`;
}

/**
 * EncodeURIComponent leaves !'()* unescaped; aws4fetch SigV4 canonical paths
 * encode them (RFC 3986). Match that so the wire URL equals the signed path.
 */
function encodeRfc3986Segment(segment: string): string {
	return encodeURIComponent(segment).replace(
		/[!'()*]/gu,
		(char) => `%${char.charCodeAt(0).toString(HEX_RADIX).toUpperCase()}`
	);
}
