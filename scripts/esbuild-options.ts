import type { BuildOptions } from 'obsidian-dev-utils/script-utils/bundlers/esbuild';

export function customizeEsbuildOptions(
	options: Parameters<NonNullable<BuildOptions['customizeEsbuildOptions']>>[0]
): void {
	const external = options.external ?? [];
	if (!external.includes('moment')) {
		external.push('moment');
	}
	options.external = external;

	// Obsidian-dev-utils defaults to conditions: ["browser"] with platform: "node".
	// That makes @aws-sdk/core/client resolve to index.browser.js, where
	// EmitWarningIfUnsupportedVersion is Symbol.for("node-only"). Nested AWS
	// Clients still call it as a function → TypeError at upload time.
	// This plugin is desktop-only; drop the browser condition so Node exports win.
	options.conditions = [];
}
