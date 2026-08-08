export interface FormatImageLinkInput {
	alt?: string;
	linkStyle: 'markdown' | 'wiki';
	target: string;
}

export class ImageLinkFormatter {
	public format(input: FormatImageLinkInput): string {
		const { alt = '', linkStyle, target } = input;
		if (/^https?:\/\//i.test(target)) {
			return alt ? `![${alt}](${target})` : `![](${target})`;
		}
		if (linkStyle === 'wiki') {
			return `![[${target}]]`;
		}
		return alt ? `![${alt}](${target})` : `![](${target})`;
	}
}
