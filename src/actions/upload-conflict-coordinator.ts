import type { UploadConflictClass } from '../storage/classify-upload-conflict.ts';

export type ConfirmOverwrite = (differentCount: number) => Promise<boolean>;

export type CoordinatedUploadMode = 'linkOnly' | 'overwrite' | 'skip' | 'upload';

interface CoordinateUploadModesInput {
	readonly classes: readonly UploadConflictClass[];
	readonly confirmOverwrite: ConfirmOverwrite;
	readonly sameMode: 'linkOnly' | 'skip';
}

/**
 * Turns conflict classifications into per-item write modes.
 * Prompts at most once when any item is content-different.
 */
export async function coordinateUploadModes(
	input: CoordinateUploadModesInput
): Promise<CoordinatedUploadMode[]> {
	const differentCount = input.classes.filter((item) => item === 'different').length;
	const overwriteAllowed = differentCount === 0
		? false
		: await input.confirmOverwrite(differentCount);

	return input.classes.map((classification) => {
		switch (classification) {
			case 'different':
				return overwriteAllowed ? 'overwrite' : 'skip';
			case 'free':
			case 'unknown':
				return 'upload';
			case 'same':
				return input.sameMode;
			default: {
				const _exhaustive: never = classification;
				return _exhaustive;
			}
		}
	});
}
