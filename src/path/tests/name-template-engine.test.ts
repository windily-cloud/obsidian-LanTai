import {
	describe,
	expect,
	it
} from 'vitest';

import type { NameTemplateContext } from '../name-template-context.ts';

import { NameTemplateEngine } from '../name-template-engine.ts';

function ctx(partial?: Partial<NameTemplateContext>): NameTemplateContext {
	return {
		ext: 'png',
		noteFileName: 'MyNote',
		noteFilePath: 'Journal/MyNote',
		noteFolderName: 'Journal',
		noteFolderPath: 'Journal',
		now: new Date(2026, 6, 22, 12, 0, 0),
		originalName: 'photo',
		...partial
	};
}

describe('NameTemplateEngine', () => {
	const engine = new NameTemplateEngine();

	it('evaluates note and original tokens', () => {
		// eslint-disable-next-line no-template-curly-in-string -- name-template token syntax
		expect(engine.evaluate('${noteFolderPath}/${originalName}.${ext}', ctx())).toBe(
			'Journal/photo.png'
		);
	});

	it('evaluates date with default and custom moment formats', () => {
		// eslint-disable-next-line no-template-curly-in-string -- name-template token syntax
		expect(engine.evaluate('${date}', ctx())).toBe('2026-07-22');
		// eslint-disable-next-line no-template-curly-in-string -- name-template token syntax
		expect(engine.evaluate('${date:YYYYMMDD}', ctx())).toBe('20260722');
		// eslint-disable-next-line no-template-curly-in-string -- name-template token syntax
		expect(engine.evaluate('${date:YYYY/MM/DD}', ctx())).toBe('2026/07/22');
	});

	it('throws on unknown token', () => {
		// eslint-disable-next-line no-template-curly-in-string -- name-template token syntax
		expect(() => engine.evaluate('${nope}', ctx())).toThrow(/nope/i);
	});

	it('evaluates random with length', () => {
		// eslint-disable-next-line no-template-curly-in-string -- name-template token syntax
		expect(engine.evaluate('${random:12}', ctx())).toMatch(/^[a-z0-9]{12}$/);
	});
});
