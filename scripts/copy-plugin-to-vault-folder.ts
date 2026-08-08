import type { Plugin } from 'esbuild';

import {
	cp,
	mkdir
} from 'node:fs/promises';
import { join } from 'node:path';

export interface CopyPluginToVaultFolderParams {
	readonly distFolder: string;
	readonly pluginName: string;
	readonly vaultConfigFolder: string;
}

/**
 * Copies `dist/dev` into the vault plugins folder without launching an owned
 * Obsidian instance. Prefer this over `OBSIDIAN_CONFIG_FOLDER` auto-launch when
 * the Trust-author dialog blocks CDP readiness and triggers relaunch loops.
 */
export function copyPluginToVaultFolder(params: CopyPluginToVaultFolderParams): Plugin {
	const { distFolder, pluginName, vaultConfigFolder } = params;

	return {
		name: 'copy-plugin-to-vault-folder',
		setup(build): void {
			build.onEnd(async (result) => {
				if (result.errors.length > 0) {
					return;
				}

				const pluginFolder = join(vaultConfigFolder, 'plugins', pluginName);
				await mkdir(pluginFolder, { recursive: true });
				await cp(distFolder, pluginFolder, { recursive: true });
				console.warn(`[lantai] Copied build → ${pluginFolder}`);
			});
		}
	};
}
