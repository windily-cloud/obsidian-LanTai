import type { BrowserDownload } from '../adapters/obsidian/browser-download.obsidian.ts';
import type { HttpFetch } from '../adapters/obsidian/http-fetch.obsidian.ts';
import type { VaultBinary } from '../adapters/obsidian/vault-binary.obsidian.ts';
import type { ActionResult } from './action-result.ts';

import { t } from '../i18n/index.ts';

interface DownloadActionInput {
	defaultFileName: string;
	download: BrowserDownload;
	http: HttpFetch;
	localPath?: string;
	remoteUrl?: string;
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
			return {
				message: t('errors.noImageSource'),
				ok: false,
				reason: 'missing'
			};
		}

		await input.download.save(input.defaultFileName, bytes);

		return { ok: true };
	}
}
