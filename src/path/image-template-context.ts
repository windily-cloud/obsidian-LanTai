import type { NameTemplateContext } from './name-template-context.ts';

import { buildNameTemplateContext } from './name-template-context.ts';

export function createImageTemplateContext(
	imageTarget: string,
	noteFilePathWithExtension: string
): NameTemplateContext {
	const fileName = imageFileName(imageTarget);
	const extensionIndex = fileName.lastIndexOf('.');
	return buildNameTemplateContext({
		ext: extensionIndex > 0 ? fileName.slice(extensionIndex + 1) : '',
		noteFilePath: noteFilePathWithExtension,
		originalName: extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName
	});
}

export function imageFileName(target: string): string {
	const withoutQuery = target.split(/[?#]/u, 1)[0] ?? target;
	const slashIndex = withoutQuery.lastIndexOf('/');
	const encodedName = (slashIndex === -1 ? withoutQuery : withoutQuery.slice(slashIndex + 1))
		|| 'image';
	try {
		return decodeURIComponent(encodedName);
	} catch {
		return encodedName;
	}
}
