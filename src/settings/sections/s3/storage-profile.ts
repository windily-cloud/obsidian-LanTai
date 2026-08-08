export interface StorageProfile {
	accessKeyIdSecretName: string;
	accountId?: string;
	bucket: string;
	endpoint?: string;
	forcePathStyle?: boolean;
	id: string;
	name: string;
	objectKeyTemplate: string;
	provider: StorageProvider;
	publicBaseUrl: string;
	region?: string;
	secretAccessKeySecretName: string;
}

export type StorageProvider = 'alibaba' | 'r2' | 's3' | 's3Compatible' | 'tencent';
