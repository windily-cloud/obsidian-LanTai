import { build } from 'obsidian-dev-utils/script-utils/bundlers/esbuild';
import { wrapCliTask } from 'obsidian-dev-utils/script-utils/cli-utils';
import { test } from 'obsidian-dev-utils/script-utils/test-runners/vitest';

import { customizeEsbuildOptions } from './esbuild-options.ts';

// Obsidian-integration-testing 的 global-setup-core 硬编码从 `dist/build/`（DIST_BUILD）读取产物，
// 既不读 ObsidianPluginRepoPaths 也没有环境变量开关，因此这里**不能**套用
// UseFlatDistBuildOutput() 的 dist/ 重映射，必须按默认输出路径先构建一次，
// 否则 harness 会报 "No build found"。
await build({ customizeEsbuildOptions });

await wrapCliTask(() =>
	test({
		projects: ['integration-tests:desktop']
	})
);
