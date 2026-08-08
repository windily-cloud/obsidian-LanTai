import {
	describe,
	expect,
	it
} from 'vitest';

import type { NameTemplateContext } from '../name-template-context.ts';

import { AttachmentPathResolver } from '../attachment-path-resolver.ts';
import { NameTemplateEngine } from '../name-template-engine.ts';

const ctx: NameTemplateContext = {
	ext: 'png',
	noteFileName: 'MyNote',
	noteFilePath: 'Journal/MyNote',
	noteFolderName: 'Journal',
	noteFolderPath: 'Journal',
	now: new Date(2026, 6, 22, 12, 0, 0),
	originalName: 'photo'
};

describe('AttachmentPathResolver', () => {
	const resolver = new AttachmentPathResolver(new NameTemplateEngine());

	it('resolves path relative to note folder', () => {
		expect(
			resolver.resolveLocalPath({
				base: 'note',
				ctx,
				noteFolderPath: 'Journal',
				// eslint-disable-next-line no-template-curly-in-string -- name-template token syntax
				template: 'assets/${originalName}.${ext}'
			})
		).toBe('Journal/assets/photo.png');
	});

	it('resolves path relative to vault root with nesting', () => {
		expect(
			resolver.resolveLocalPath({
				base: 'vault',
				ctx,
				noteFolderPath: 'Journal',
				// eslint-disable-next-line no-template-curly-in-string -- name-template token syntax
				template: 'attachments/${noteFolderPath}/${originalName}.${ext}'
			})
		).toBe('attachments/Journal/photo.png');
	});

	it('resolves object key independently', () => {
		expect(
			resolver.resolveObjectKey({
				ctx,
				// eslint-disable-next-line no-template-curly-in-string -- name-template token syntax
				template: 'images/${date}/${originalName}.${ext}'
			})
		).toBe('images/2026-07-22/photo.png');
	});
});
