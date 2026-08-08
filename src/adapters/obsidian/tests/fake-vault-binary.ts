import { noopAsync } from 'obsidian-dev-utils/function';

import type { VaultBinary } from '../vault-binary.obsidian.ts';

/** Test double for VaultBinary. */
export class FakeVaultBinary implements VaultBinary {
	/** Exposed for unit tests. */
	public readonly trashed: string[] = [];
	private readonly files: Map<string, Uint8Array>;

	public constructor(initial: Record<string, Uint8Array> = {}) {
		this.files = new Map(Object.entries(initial));
	}

	public exists(path: string): Promise<boolean> {
		return Promise.resolve(this.files.has(path));
	}

	public modifyBinary(path: string, bytes: Uint8Array): Promise<void> {
		if (!this.files.has(path)) {
			return Promise.reject(new Error(`Missing vault file: ${path}`));
		}
		this.files.set(path, bytes);
		return noopAsync();
	}

	public readBinary(path: string): Promise<Uint8Array> {
		const bytes = this.files.get(path);
		if (!bytes) {
			return Promise.reject(new Error(`Missing vault file: ${path}`));
		}
		return Promise.resolve(bytes);
	}

	public trash(path: string): Promise<void> {
		this.trashed.push(path);
		this.files.delete(path);
		return noopAsync();
	}

	public writeBinary(path: string, bytes: Uint8Array): Promise<void> {
		this.files.set(path, bytes);
		return noopAsync();
	}
}
