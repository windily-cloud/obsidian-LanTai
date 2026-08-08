import type { HttpFetch } from '../http-fetch.obsidian.ts';

interface FakeHttpFetchConstructorOptions {
	readonly responses?: Record<string, Uint8Array>;
}

/** Test double for HttpFetch. */
export class FakeHttpFetch implements HttpFetch {
	/** Exposed for unit tests. */
	public readonly calls: string[] = [];
	private readonly responses: Map<string, Uint8Array>;

	public constructor(options: FakeHttpFetchConstructorOptions = {}) {
		this.responses = new Map(Object.entries(options.responses ?? {}));
	}

	public fetchBinary(url: string): Promise<Uint8Array> {
		this.calls.push(url);
		const bytes = this.responses.get(url);
		if (!bytes) {
			return Promise.reject(new Error(`No fake response for: ${url}`));
		}
		return Promise.resolve(bytes);
	}
}
