import { requestUrl } from 'obsidian';

export interface HttpFetch {
	fetchBinary(url: string): Promise<Uint8Array>;
}

export class ObsidianHttpFetch implements HttpFetch {
	public async fetchBinary(url: string): Promise<Uint8Array> {
		const response = await requestUrl(url);
		return new Uint8Array(response.arrayBuffer);
	}
}
