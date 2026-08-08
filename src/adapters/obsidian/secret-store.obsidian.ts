import type { App } from 'obsidian';

export interface ObsidianSecretStoreConstructorParams {
	readonly app: App;
}

export class ObsidianSecretStore {
	private readonly app: App;

	public constructor(params: ObsidianSecretStoreConstructorParams) {
		this.app = params.app;
	}

	public getSecret(name: string): null | string {
		return name ? this.app.secretStorage.getSecret(name) : null;
	}
}
