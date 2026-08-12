import { AwsV4Signer } from 'aws4fetch';

import type { ObjectStorageRequest } from './object-storage-transport.ts';
import type { S3Connection } from './s3-connection.ts';

const DEFAULT_PRESIGN_EXPIRES_SECONDS = 3600;
const HEX_BYTE_PAD = 2;
const HEX_RADIX = 16;

/**
 * SigV4 request signer backed by aws4fetch (WebCrypto only — browser/mobile safe).
 * Thin adapter so the signing library stays swappable behind a single method.
 *
 * S3 PUTs hash the payload instead of aws4fetch's default `UNSIGNED-PAYLOAD`.
 * Android OkHttp/`requestUrl` otherwise often abort with `IOException Stream closed`.
 * Uses AwsV4Signer directly (not AwsClient → Request) so wire URLs keep RFC3986
 * encodings such as `%21` for `!` — URL/Request pathname would decode them back.
 */
export class SigV4Signer {
	private readonly accessKeyId: string;
	private readonly region: string;
	private readonly secretAccessKey: string;

	public constructor(connection: S3Connection) {
		this.accessKeyId = connection.accessKeyId;
		this.region = connection.region;
		this.secretAccessKey = connection.secretAccessKey;
	}

	public async sign(request: ObjectStorageRequest): Promise<ObjectStorageRequest> {
		const headers = { ...request.headers };
		if (request.body !== undefined && !hasHeader(headers, 'x-amz-content-sha256')) {
			headers['x-amz-content-sha256'] = await sha256Hex(request.body);
		}
		const signer = new AwsV4Signer({
			accessKeyId: this.accessKeyId,
			headers,
			method: request.method,
			region: this.region,
			secretAccessKey: this.secretAccessKey,
			service: 's3',
			url: request.url
		});
		const signed = await signer.sign();
		return {
			...request,
			headers: Object.fromEntries(signed.headers.entries()),
			url: wireUrlFromSigner(signer, signed.url)
		};
	}

	/** Presigned GET URL (query SigV4), matching files-sdk `url()` when publicBaseUrl is unset. */
	public async signQuery(
		url: string,
		expiresInSeconds = DEFAULT_PRESIGN_EXPIRES_SECONDS
	): Promise<string> {
		const withExpiry = new URL(url);
		withExpiry.searchParams.set('X-Amz-Expires', String(expiresInSeconds));
		const signer = new AwsV4Signer({
			accessKeyId: this.accessKeyId,
			method: 'GET',
			region: this.region,
			secretAccessKey: this.secretAccessKey,
			service: 's3',
			signQuery: true,
			url: withExpiry.toString()
		});
		const signed = await signer.sign();
		return wireUrlFromSigner(signer, signed.url);
	}
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
	const needle = name.toLowerCase();
	return Object.keys(headers).some((key) => key.toLowerCase() === needle);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
	const copy = new Uint8Array(bytes);
	// Obsidian runs in Chromium; Node's WebCrypto feature gate does not apply here.
	// eslint-disable-next-line n/no-unsupported-features/node-builtins -- browser crypto.subtle
	const digest = await crypto.subtle.digest('SHA-256', copy);
	return [...new Uint8Array(digest)]
		.map((byte) => byte.toString(HEX_RADIX).padStart(HEX_BYTE_PAD, '0'))
		.join('');
}

/** Avoid URL.pathname, which decodes `%21` back to `!` and breaks SigV4 on Electron. */
function wireUrlFromSigner(signer: AwsV4Signer, signedUrl: URL): string {
	return `${signedUrl.protocol}//${signedUrl.host}${signer.encodedPath}${signedUrl.search}`;
}
