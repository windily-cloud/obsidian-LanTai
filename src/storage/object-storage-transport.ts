/** Signed or unsigned HTTP request the storage client asks the transport to perform. */
export interface ObjectStorageRequest {
	readonly body?: Uint8Array;
	readonly headers: Record<string, string>;
	readonly method: 'DELETE' | 'GET' | 'HEAD' | 'PUT';
	readonly url: string;
}

/** Eagerly buffered HTTP response. Header names are lowercase. */
export interface ObjectStorageResponse {
	readonly body: Uint8Array;
	readonly headers: Record<string, string>;
	readonly status: number;
}

/**
 * Transport seam: performs the actual HTTP call. Implementations decide how
 * requests leave the app (Obsidian `requestUrl` — CORS-free — or plain fetch).
 */
export interface ObjectStorageTransport {
	send(request: ObjectStorageRequest): Promise<ObjectStorageResponse>;
}
