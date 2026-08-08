import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import process, { loadEnvFile } from 'node:process';
import { dev } from 'obsidian-dev-utils/script-utils/bundlers/esbuild';
import { wrapCliTask } from 'obsidian-dev-utils/script-utils/cli-utils';
import { readPackageJson } from 'obsidian-dev-utils/script-utils/npm';
import { resolvePathFromRootSafe } from 'obsidian-dev-utils/script-utils/root';

import { copyPluginToVaultFolder } from './copy-plugin-to-vault-folder.ts';
import { customizeEsbuildOptions } from './esbuild-options.ts';

/**
 * Official `dev()` auto-launches an isolated Obsidian via CDP when
 * `OBSIDIAN_CONFIG_FOLDER` is set. That path repeatedly fails here: the
 * Trust-author dialog blocks vault readiness → 30s timeout → kill/relaunch
 * loop. We keep watch+copy, and open Obsidian ourselves (trust once).
 */
const envPath = resolvePathFromRootSafe({ path: '.env' });
if (existsSync(envPath)) {
	loadEnvFile(envPath);
}

const envConfigFolder = process.env['OBSIDIAN_CONFIG_FOLDER']?.trim() ?? '';
const vaultConfigFolder = envConfigFolder === ''
	? ''
	: resolve(process.cwd(), envConfigFolder);

if (vaultConfigFolder !== '' && !existsSync(vaultConfigFolder)) {
	throw new Error(
		`OBSIDIAN_CONFIG_FOLDER does not exist: ${vaultConfigFolder}`
	);
}

const packageJson = await readPackageJson();
const pluginName = packageJson.name ?? 'lantai';
const distFolder = resolvePathFromRootSafe({ path: 'dist/dev' });

if (vaultConfigFolder !== '') {
	console.warn(
		`[lantai] Watching and copying to ${vaultConfigFolder}/plugins/${pluginName}`
	);
	console.warn(
		'[lantai] Open demo-vault in your normal Obsidian, trust it once, enable Hot Reload + this plugin.'
	);
	console.warn(
		'[lantai] Ignore official "No Obsidian config folder configured" debug line — copy is handled here without auto-launch.'
	);
}

await wrapCliTask(() =>
	dev({
		customizeEsbuildOptions,
		// Disable owned-Obsidian launch from obsidian-dev-utils.
		obsidianConfigFolder: '',
		...(vaultConfigFolder === ''
			? {}
			: {
				customEsbuildPlugins: [
					copyPluginToVaultFolder({
						distFolder,
						pluginName,
						vaultConfigFolder
					})
				]
			})
	})
);
