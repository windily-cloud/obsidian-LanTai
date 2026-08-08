import type { HttpFetch } from '../adapters/obsidian/http-fetch.obsidian.ts';
import type { SaveDialog } from '../adapters/obsidian/save-dialog.obsidian.ts';
import type { VaultBinary } from '../adapters/obsidian/vault-binary.obsidian.ts';
import type { ActionResult } from './action-result.ts';

import { t } from '../i18n/index.ts';

interface DownloadActionInput {
	defaultFileName: string;
	http: HttpFetch;
	localPath?: string;
	remoteUrl?: string;
	saveDialog: SaveDialog;
	vault: VaultBinary;
}

export class DownloadAction {
	public async execute(input: DownloadActionInput): Promise<ActionResult> {
		let bytes: Uint8Array;
		if (input.remoteUrl) {
			bytes = await input.http.fetchBinary(input.remoteUrl);
		} else if (input.localPath) {
			bytes = await input.vault.readBinary(input.localPath);
		} else {
			return { message: t('errors.noImageSource'), ok: false, reason: 'missing' };
		}

		const picked = await input.saveDialog.pickSavePath(input.defaultFileName);
		if (picked === null) {
			return { cancelled: true, ok: true };
		}

		await input.saveDialog.writeOsFile(picked, bytes);

		return { ok: true };
	}
}
