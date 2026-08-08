import process from 'node:process';
import { wrapCliTask } from 'obsidian-dev-utils/script-utils/cli-utils';
import { spellcheck } from 'obsidian-dev-utils/script-utils/linters/cspell';

import { withoutDemoVaultPaths } from './without-demo-vault-paths.ts';

const [, , ...paths] = process.argv;
const targets = withoutDemoVaultPaths(paths);

if (paths.length > 0 && targets.length === 0) {
	process.exit(0);
}

await wrapCliTask(() => spellcheck({ paths: targets }));
