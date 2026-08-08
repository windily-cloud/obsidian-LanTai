import type { NameTemplateContext } from './name-template-context.ts';
import type { NameTemplateEngine } from './name-template-engine.ts';

interface ResolveLocalPathInput {
	base: 'note' | 'vault';
	ctx: NameTemplateContext;
	noteFolderPath: string;
	template: string;
}

interface ResolveObjectKeyInput {
	ctx: NameTemplateContext;
	template: string;
}

export class AttachmentPathResolver {
	public constructor(private readonly engine: NameTemplateEngine) {}

	public resolveLocalPath(input: ResolveLocalPathInput): string {
		const relative = this.normalize(this.engine.evaluate(input.template, input.ctx));
		if (input.base === 'vault') {
			return relative;
		}
		const folder = input.noteFolderPath.replace(/\/$/, '');
		if (relative === '' || relative === '.') {
			return folder;
		}
		return folder ? `${folder}/${relative}` : relative;
	}

	public resolveObjectKey(input: ResolveObjectKeyInput): string {
		return this.normalize(this.engine.evaluate(input.template, input.ctx));
	}

	private normalize(path: string): string {
		return path.replace(/^\/+/, '').replaceAll('\\', '/');
	}
}
