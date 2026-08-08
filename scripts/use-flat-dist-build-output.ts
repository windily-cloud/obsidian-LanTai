import { ObsidianPluginRepoPaths } from 'obsidian-dev-utils/obsidian/plugin/obsidian-plugin-repo-paths';

/**
 * Obsidian community review looks for `main.js` under `dist/` (or repo root /
 * `build/` / `out/`). obsidian-dev-utils defaults to `dist/build`; remap
 * production output to `dist/` before any build or release runs.
 */
export function useFlatDistBuildOutput(): void {
	// Runtime enum object is mutable; the published .d.ts marks members readonly.
	Reflect.set(ObsidianPluginRepoPaths, 'DistBuild', 'dist');
}
