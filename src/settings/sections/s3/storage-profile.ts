/** 走自研 S3 协议栈的 provider（不含 lantai——它是 REST，见 docs/adr/0005）。 */
export type S3StorageProvider = Exclude<StorageProvider, 'lantai'>;

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

export type StorageProvider = 'alibaba' | 'lantai' | 'r2' | 's3' | 's3Compatible' | 'tencent';
