import type { App } from 'obsidian';

interface ObsidianSecretStoreConstructorParams {
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

	/**
	 * 写入密钥；`value` 为 null 时写入空串。
	 * Obsidian 的 `SecretStorage` 没有删除 API，因此读取侧把空串视为「未配置」。
	 */
	public setSecret(name: string, value: null | string): void {
		if (!name) {
			return;
		}
		this.app.secretStorage.setSecret(name, value ?? '');
	}
}
