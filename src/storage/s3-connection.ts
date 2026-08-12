/**
 * S3-protocol connection description shared by every storage provider.
 * Produced by a {@link StorageProviderAdapter}; consumed by the object-storage client.
 */
export interface S3Connection {
	readonly accessKeyId: string;
	readonly bucket: string;
	readonly endpoint: string;
	readonly forcePathStyle: boolean;
	readonly publicBaseUrl: string;
	readonly region: string;
	readonly secretAccessKey: string;
}
