import {
	describe,
	expect,
	it
} from 'vitest';

import { resolveMobileImageContextMenu } from '../mobile-image-context-menu.ts';

describe('resolveMobileImageContextMenu', () => {
	it('passes through when the target is not a source-view image', () => {
		expect(
			resolveMobileImageContextMenu({
				hitSourceImage: false,
				isPreviewMode: false,
				menuAlreadyShown: false
			})
		).toBe('pass');
	});

	it('passes through reading/preview mode so the native image menu stays', () => {
		expect(
			resolveMobileImageContextMenu({
				hitSourceImage: true,
				isPreviewMode: true,
				menuAlreadyShown: false
			})
		).toBe('pass');
	});

	it('suppresses the native drawer without showing again after a long-press menu', () => {
		expect(
			resolveMobileImageContextMenu({
				hitSourceImage: true,
				isPreviewMode: false,
				menuAlreadyShown: true
			})
		).toBe('suppress');
	});

	it('shows the LanTai menu for a source-view image when nothing has been shown yet', () => {
		expect(
			resolveMobileImageContextMenu({
				hitSourceImage: true,
				isPreviewMode: false,
				menuAlreadyShown: false
			})
		).toBe('show');
	});
});
