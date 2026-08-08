import { moment as obsidianMoment } from 'obsidian';
import { extractDefaultExportInterop } from 'obsidian-dev-utils/object-utils';

import type { NameTemplateContext } from './name-template-context.ts';

const DEFAULT_RANDOM_LENGTH = 8;
const TOKEN_RE = /\$\{(?<name>[a-zA-Z]+)(?::(?<format>[^}]+))?\}/g;

/** Obsidian typings export `moment` as a namespace; runtime value is the callable moment factory. */
const momentFn = extractDefaultExportInterop(obsidianMoment);

export class NameTemplateEngine {
	public evaluate(template: string, ctx: NameTemplateContext): string {
		let result = '';
		let lastIndex = 0;
		for (const match of template.matchAll(TOKEN_RE)) {
			const name = match.groups?.['name'] ?? '';
			const format = match.groups?.['format'];
			result += template.slice(lastIndex, match.index);
			result += this.resolveToken(name, format, ctx);
			lastIndex = match.index + match[0].length;
		}
		result += template.slice(lastIndex);
		return result;
	}

	private formatDate(date: Date, pattern: string): string {
		return momentFn(date).format(pattern);
	}

	private randomAlnum(length: number): string {
		const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
		let out = '';
		for (let i = 0; i < length; i++) {
			const index = Math.floor(Math.random() * alphabet.length);
			out += alphabet.charAt(index);
		}
		return out;
	}

	private resolveToken(
		name: string,
		format: string | undefined,
		ctx: NameTemplateContext
	): string {
		switch (name) {
			case 'date':
				return this.formatDate(ctx.now, format ?? 'YYYY-MM-DD');
			case 'ext':
				return ctx.ext;
			case 'noteFileName':
				return ctx.noteFileName;
			case 'noteFilePath':
				return ctx.noteFilePath;
			case 'noteFolderName':
				return ctx.noteFolderName;
			case 'noteFolderPath':
				return ctx.noteFolderPath;
			case 'originalName':
				return ctx.originalName;
			case 'random': {
				const len = format ? Number(format) : DEFAULT_RANDOM_LENGTH;
				return this.randomAlnum(Number.isFinite(len) ? len : DEFAULT_RANDOM_LENGTH);
			}
			case 'uuid':
				// eslint-disable-next-line n/no-unsupported-features/node-builtins -- randomUUID in Node 24+
				return crypto.randomUUID().replaceAll('-', '').toLowerCase();
			default:
				throw new Error(`Unknown token: ${name}`);
		}
	}
}
