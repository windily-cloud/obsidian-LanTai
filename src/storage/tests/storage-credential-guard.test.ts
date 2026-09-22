import {
	describe,
	expect,
	it
} from 'vitest';

import {
	formatActionError,
	isListAccessDenied,
	validateStorageSecrets
} from '../storage-credential-guard.ts';
import { StorageRequestError } from '../storage-request-error.ts';

describe('validateStorageSecrets', () => {
	it('rejects when both fields bind the same secret name', () => {
		expect(
			validateStorageSecrets({
				accessKeyId: 'AKID',
				accessKeyIdSecretName: 'tencent-id',
				secretAccessKey: 'AKID',
				secretAccessKeySecretName: 'tencent-id'
			})
		).toBe(
			'Access Key ID and Secret Access Key must use different secrets.'
		);
	});

	it('rejects when resolved secret values are identical', () => {
		expect(
			validateStorageSecrets({
				accessKeyId: 'same-value',
				accessKeyIdSecretName: 'ak',
				secretAccessKey: 'same-value',
				secretAccessKeySecretName: 'sk'
			})
		).toBe(
			'Access Key ID and Secret Access Key resolve to the same value. Bind different secrets.'
		);
	});

	it('accepts distinct secret names and values', () => {
		expect(
			validateStorageSecrets({
				accessKeyId: 'AKID',
				accessKeyIdSecretName: 'ak',
				secretAccessKey: 'SECRET',
				secretAccessKeySecretName: 'sk'
			})
		).toBeNull();
	});
});

describe('formatActionError', () => {
	it('explains AccessDenied list failures for the gallery', () => {
		const error = Object.assign(new Error('Access Denied'), {
			code: 'AccessDenied'
		});
		expect(formatActionError(error)).toBe(
			'Listing the bucket was denied. Grant ListBucket permission for this key.'
		);
		expect(isListAccessDenied(error)).toBe(true);
		expect(isListAccessDenied(
			new Error('FilesError: Access Denied', {
				cause: Object.assign(new Error('Access Denied'), { code: 'AccessDenied' })
			})
		)).toBe(true);
	});

	it('explains opaque UnknownError with Unauthorized code', () => {
		const error = Object.assign(new Error('UnknownError'), {
			code: 'Unauthorized'
		});
		expect(formatActionError(error)).toBe(
			'Storage authorization failed. Check Access Key ID, Secret Access Key, bucket, and region.'
		);
	});

	it('includes storage error code when message is opaque', () => {
		const error = Object.assign(new Error('UnknownError'), {
			code: 'Provider'
		});
		expect(formatActionError(error)).toBe('Storage error (Provider).');
	});

	it('passes through normal error messages', () => {
		expect(formatActionError(new Error('Bucket not found'))).toBe(
			'Bucket not found'
		);
	});

	it('shows the server quota message instead of wrapping the provider code', () => {
		const cause = Object.assign(new Error('存储空间已用尽（已用 100.0 MB / 配额 100.0 MB）。'), {
			code: 'QuotaExceeded'
		});
		const error = new StorageRequestError('Provider', cause.message, { cause });
		expect(formatActionError(error)).toBe(cause.message);
	});

	it('falls back to a quota explanation when the server message is missing', () => {
		const cause = Object.assign(new Error(''), { code: 'QuotaExceeded' });
		const error = new StorageRequestError('Provider', 'Storage error (QuotaExceeded).', { cause });
		expect(formatActionError(error)).toBe(
			'Storage is full. Delete images or upgrade your plan before uploading again.'
		);
	});
});
