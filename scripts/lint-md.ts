/**
 * No-op stub: `obsidian-dev-utils` `updateVersion` always runs `npm run lint:md`.
 * This project does not lint Markdown; keep the script so releases can proceed.
 */
import { wrapCliTask } from 'obsidian-dev-utils/script-utils/cli-utils';

await wrapCliTask(async () => {
	// Intentionally empty.
});
