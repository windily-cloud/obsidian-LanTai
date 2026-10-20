import {
	describe,
	expect,
	it
} from 'vitest';

import {
	LANTAI_API_KEY_SECRET_NAME,
	resolveLanTaiApiKeySecretName
} from '../lantai-credentials.ts';

describe('resolveLanTaiApiKeySecretName', () => {
	it('falls back to the legacy name when the setting is absent', () => {
		expect(resolveLanTaiApiKeySecretName(undefined)).toBe(LANTAI_API_KEY_SECRET_NAME);
		expect(resolveLanTaiApiKeySecretName(null)).toBe(LANTAI_API_KEY_SECRET_NAME);
	});

	it('keeps the empty string as an explicit unlink', () => {
		expect(resolveLanTaiApiKeySecretName('')).toBe('');
	});

	it('accepts any user-chosen secret name after trimming', () => {
		expect(resolveLanTaiApiKeySecretName('my-lantai')).toBe('my-lantai');
		expect(resolveLanTaiApiKeySecretName('  my-secret  ')).toBe('my-secret');
	});
});
