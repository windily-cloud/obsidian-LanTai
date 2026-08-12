import {
	describe,
	expect,
	it
} from 'vitest';

import { editorImageMenuActions } from '../command-registrar.ts';

describe('editorImageMenuActions', () => {
	it('offers upload and download for a local image', () => {
		expect(editorImageMenuActions(false)).toEqual(['upload', 'download']);
	});

	it('offers localize and download for a remote image', () => {
		expect(editorImageMenuActions(true)).toEqual(['localize', 'download']);
	});
});
