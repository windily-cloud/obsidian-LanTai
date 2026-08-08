export interface NameTemplateContext {
	ext: string;
	noteFileName: string;
	noteFilePath: string;
	noteFolderName: string;
	noteFolderPath: string;
	now: Date;
	originalName: string;
}

interface BuildNameTemplateContextInput {
	readonly ext: string;
	readonly noteFilePath: string;
	readonly now?: Date;
	readonly originalName: string;
}

export function buildNameTemplateContext(
	input: BuildNameTemplateContextInput
): NameTemplateContext {
	const notePath = stripExtension(input.noteFilePath);
	const folderPath = noteFolderPath(input.noteFilePath);
	return {
		ext: input.ext,
		noteFileName: basename(notePath),
		noteFilePath: notePath,
		noteFolderName: basename(folderPath),
		noteFolderPath: folderPath,
		now: input.now ?? new Date(),
		originalName: input.originalName
	};
}

function basename(path: string): string {
	const index = path.lastIndexOf('/');
	return index === -1 ? path : path.slice(index + 1);
}

function noteFolderPath(path: string): string {
	const index = path.lastIndexOf('/');
	return index === -1 ? '' : path.slice(0, index);
}

function stripExtension(path: string): string {
	const slashIndex = path.lastIndexOf('/');
	const extensionIndex = path.lastIndexOf('.');
	return extensionIndex > slashIndex ? path.slice(0, extensionIndex) : path;
}
