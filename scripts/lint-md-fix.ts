import process from 'node:process';
import { wrapCliTask } from 'obsidian-dev-utils/script-utils/cli-utils';
import { lint } from 'obsidian-dev-utils/script-utils/linters/markdownlint';

import { resolveMarkdownLintPaths } from './resolve-markdown-lint-paths.ts';

const [, , ...paths] = process.argv;
const targets = await resolveMarkdownLintPaths(paths);

if (targets === 'skip') {
	process.exit(0);
}

await wrapCliTask(() => lint({ paths: targets, shouldFix: true }));
