import { getNanoStagedConfig } from 'obsidian-dev-utils/script-utils/nano-staged-config';

// Preserve NANO_STAGED opt-out (exits process when disabled).
getNanoStagedConfig();

/**
 * Same checks as obsidian-dev-utils, but skip the local Obsidian demo vault —
 * it is a scratch workspace and must not block commits.
 */
export const config: Record<string, string[]> = {
	'!(demo-vault)*': ['npm run spellcheck --'],
	'!(demo-vault)*.{ts,tsx,mts}': ['npm run format --'],
	'!(demo-vault)*.md': ['npm run lint:md:fix --'],
	'!(templates|demo-vault)*.{ts,tsx,mts}': ['npm run lint:fix --']
};
