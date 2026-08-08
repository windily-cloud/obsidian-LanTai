import { build } from 'obsidian-dev-utils/script-utils/bundlers/esbuild';
import { wrapCliTask } from 'obsidian-dev-utils/script-utils/cli-utils';

import { customizeEsbuildOptions } from './esbuild-options.ts';
import { useFlatDistBuildOutput } from './use-flat-dist-build-output.ts';

useFlatDistBuildOutput();

await wrapCliTask(() => build({ customizeEsbuildOptions }));
