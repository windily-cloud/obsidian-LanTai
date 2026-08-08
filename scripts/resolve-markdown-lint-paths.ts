import { glob } from 'node:fs/promises';

import { withoutDemoVaultPaths } from './without-demo-vault-paths.ts';

/**
 * Markdown paths to validate. Returns `skip` when CLI args were only under demo-vault.
 */
export async function resolveMarkdownLintPaths(
	cliPaths: string[]
): Promise<'skip' | string[]> {
	if (cliPaths.length > 0) {
		const filtered = withoutDemoVaultPaths(cliPaths);
		return filtered.length === 0 ? 'skip' : filtered;
	}

	const files: string[] = [];
	for await (
		const file of glob('**/*.md', {
			exclude: [
				'**/node_modules/**',
				'.git/**',
				'dist/**',
				'demo-vault/**',
				'reference/**'
			]
		})
	) {
		files.push(file);
	}
	return files;
}
