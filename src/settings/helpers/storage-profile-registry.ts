import type { PluginSettings } from '../plugin-settings.ts';
import type { StorageProfile } from '../sections/s3/storage-profile.ts';

export class StorageProfileRegistry {
	public constructor(private readonly settings: PluginSettings) {}

	public add(profile: StorageProfile): void {
		if (this.settings.profiles.some((p) => p.id === profile.id)) {
			throw new Error(`Profile already exists: ${profile.id}`);
		}
		this.settings.profiles.push(profile);
		if (this.settings.profiles.length === 1) {
			this.settings.activeProfileId = profile.id;
		}
	}

	public assertReadyForUpload(profile: StorageProfile): void {
		if (!profile.publicBaseUrl.trim()) {
			throw new Error('publicBaseUrl is required');
		}
		if (!profile.bucket.trim()) {
			throw new Error('bucket is required');
		}
		if (!profile.accessKeyIdSecretName.trim()) {
			throw new Error('accessKeyIdSecretName is required');
		}
		if (!profile.secretAccessKeySecretName.trim()) {
			throw new Error('secretAccessKeySecretName is required');
		}
	}

	public getActive(): null | StorageProfile {
		if (!this.settings.activeProfileId) {
			return null;
		}
		return (
			this.settings.profiles.find((p) => p.id === this.settings.activeProfileId) ?? null
		);
	}

	public list(): StorageProfile[] {
		return [...this.settings.profiles];
	}

	public remove(id: string): void {
		const index = this.settings.profiles.findIndex((p) => p.id === id);
		if (index === -1) {
			throw new Error(`Unknown profile id: ${id}`);
		}
		this.settings.profiles.splice(index, 1);
		if (this.settings.activeProfileId === id) {
			this.settings.activeProfileId = this.settings.profiles[0]?.id ?? null;
		}
	}

	public setActive(id: string): void {
		if (!this.settings.profiles.some((p) => p.id === id)) {
			throw new Error(`Unknown profile id: ${id}`);
		}
		this.settings.activeProfileId = id;
	}

	public update(profile: StorageProfile): void {
		const index = this.settings.profiles.findIndex((p) => p.id === profile.id);
		if (index === -1) {
			throw new Error(`Unknown profile id: ${profile.id}`);
		}
		this.settings.profiles[index] = profile;
	}
}
