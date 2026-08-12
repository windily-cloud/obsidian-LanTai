import type { BuildOptions } from 'obsidian-dev-utils/script-utils/bundlers/esbuild';

export function customizeEsbuildOptions(
	options: Parameters<NonNullable<BuildOptions['customizeEsbuildOptions']>>[0]
): void {
	const external = options.external ?? [];
	if (!external.includes('moment')) {
		external.push('moment');
	}
	options.external = external;
}
