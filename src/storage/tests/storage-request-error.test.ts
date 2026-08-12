import {
	describe,
	expect,
	it
} from 'vitest';

import { isPermissionProbeError } from '../probe-object-exists.ts';
import { isListAccessDenied } from '../storage-credential-guard.ts';
import {
	mapS3ErrorResponse,
	StorageRequestError
} from '../storage-request-error.ts';

describe('mapS3ErrorResponse', () => {
	it('maps 404 to NotFound with a fallback message', () => {
		const error = mapS3ErrorResponse(404, '');

		expect(error).toBeInstanceOf(StorageRequestError);
		expect(error.code).toBe('NotFound');
		expect(error.message).toBe('Not found');
	});

	it('maps S3 access errors to Unauthorized while keeping the raw code reachable', () => {
		const xml = '<Error><Code>AccessDenied</Code><Message>Access Denied</Message></Error>';
		const error = mapS3ErrorResponse(403, xml);

		expect(error.code).toBe('Unauthorized');
		expect(error.message).toBe('Access Denied');
		expect(isListAccessDenied(error)).toBe(true);
		expect(isPermissionProbeError(error)).toBe(true);
	});

	it('maps credential errors to Unauthorized', () => {
		const xml = '<Error><Code>SignatureDoesNotMatch</Code><Message>signature mismatch</Message></Error>';
		const error = mapS3ErrorResponse(403, xml);

		expect(error.code).toBe('Unauthorized');
		expect(isPermissionProbeError(error)).toBe(true);
	});

	it('maps 409 to Conflict', () => {
		expect(mapS3ErrorResponse(409, '').code).toBe('Conflict');
	});

	it('maps anything else to Provider', () => {
		const error = mapS3ErrorResponse(500, '<html>Bad Gateway</html>');

		expect(error.code).toBe('Provider');
		expect(error.message).toBe('Object storage error');
	});
});
