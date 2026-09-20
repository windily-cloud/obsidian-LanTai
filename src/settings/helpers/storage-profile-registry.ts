import type { PluginSettings } from '../plugin-settings.ts';
import type { StorageProfile } from '../sections/s3/storage-profile.ts';

import { t } from '../../i18n/index.ts';
import { LANTAI_PROFILE_ID } from '../sections/s3/storage-profile.ts';

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

	/** Exposed for unit tests. */
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

	/**
	 * 保证库内有一张兰台配置档并排在最前。
	 * 尚无当前启用配置档时，默认启用兰台（引导优先选择）。
	 * 已有其它启用档时不抢 active。
	 */
	public ensureLanTai(): boolean {
		let changed = false;
		if (!this.settings.profiles.some((profile) => profile.provider === 'lantai')) {
			this.settings.profiles.unshift(createLanTaiProfile(this.settings.profiles));
			changed = true;
		}
		if (!this.settings.activeProfileId) {
			const lantai = this.settings.profiles.find((profile) => profile.provider === 'lantai');
			if (lantai) {
				this.settings.activeProfileId = lantai.id;
				changed = true;
			}
		}
		return changed;
	}

	/** Exposed for unit tests. */
	public getActive(): null | StorageProfile {
		if (!this.settings.activeProfileId) {
			return null;
		}
		return (
			this.settings.profiles.find((p) => p.id === this.settings.activeProfileId) ?? null
		);
	}

	public list(): StorageProfile[] {
		return orderLanTaiFirst(this.settings.profiles);
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
}

function createLanTaiProfile(existing: readonly StorageProfile[]): StorageProfile {
	const taken = new Set(existing.map((profile) => profile.id));
	const id = taken.has(LANTAI_PROFILE_ID) ? `lantai-${String(Date.now())}` : LANTAI_PROFILE_ID;
	return {
		accessKeyIdSecretName: '',
		bucket: '',
		id,
		name: t('settings.providerLantai'),
		// eslint-disable-next-line no-template-curly-in-string -- name-template token syntax
		objectKeyTemplate: 'images/${originalName}.${ext}',
		provider: 'lantai',
		publicBaseUrl: '',
		secretAccessKeySecretName: ''
	};
}

function orderLanTaiFirst(profiles: readonly StorageProfile[]): StorageProfile[] {
	const preferred: StorageProfile[] = [];
	const rest: StorageProfile[] = [];
	for (const profile of profiles) {
		if (profile.provider === 'lantai') {
			preferred.push(profile);
		} else {
			rest.push(profile);
		}
	}
	return [...preferred, ...rest];
}
