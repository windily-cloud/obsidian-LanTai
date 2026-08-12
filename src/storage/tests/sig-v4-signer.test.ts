import { AwsV4Signer } from 'aws4fetch';
import {
	describe,
	expect,
	it
} from 'vitest';

import type { S3Connection } from '../s3-connection.ts';

import { buildObjectUrl } from '../s3-urls.ts';
import { SigV4Signer } from '../sig-v4-signer.ts';

const CONNECTION: S3Connection = {
	accessKeyId: 'ak',
	bucket: 'pics',
	endpoint: 'https://cos.ap-chengdu.myqcloud.com',
	forcePathStyle: false,
	publicBaseUrl: 'https://cdn.example.com',
	region: 'ap-chengdu',
	secretAccessKey: 'sk'
};

describe('SigV4Signer', () => {
	it('emits a wire URL path that matches aws4fetch encodedPath for keys with !', async () => {
		const key = 'testing/images/૮ ˶ᵔ ᵕ ᵔ˶ ა Follow me!.jpg';
		const url = buildObjectUrl(CONNECTION, key);
		const signer = new SigV4Signer(CONNECTION);

		const signed = await signer.sign({
			body: new Uint8Array([1]),
			headers: { 'content-type': 'image/jpeg' },
			method: 'PUT',
			url
		});

		const reference = new AwsV4Signer({
			accessKeyId: CONNECTION.accessKeyId,
			headers: { 'content-type': 'image/jpeg', 'x-amz-content-sha256': 'placeholder' },
			method: 'PUT',
			region: CONNECTION.region,
			secretAccessKey: CONNECTION.secretAccessKey,
			service: 's3',
			url
		});
		const expectedWireUrl = `${new URL(url).protocol}//${new URL(url).host}${reference.encodedPath}`;

		expect(reference.encodedPath).toContain('%21');
		expect(signed.url).toBe(expectedWireUrl);
		expect(signed.url).toContain('%21');
		expect(signed.url).not.toMatch(/me!/u);
		expect(signed.headers['authorization']).toMatch(/^AWS4-HMAC-SHA256 Credential=ak\//u);
		expect(signed.headers['x-amz-content-sha256']).toBeDefined();
		expect(signed.body).toEqual(new Uint8Array([1]));
	});
});
