/**
 * Paths under the local Obsidian scratch vault must not be validated.
 */
export function withoutDemoVaultPaths(paths: string[]): string[] {
	return paths.filter(
		(path) => !path.replaceAll('\\', '/').split('/').includes('demo-vault')
	);
}
