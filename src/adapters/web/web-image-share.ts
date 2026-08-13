import { t } from '../../i18n/index.ts';
import { sniffImageMime } from './web-image-clipboard.ts';

interface ShareFileInput {
	readonly bytes: Uint8Array;
	readonly name: string;
}

interface WebImageShareConstructorOptions {
	share?(this: void, data: ShareData): Promise<void>;
}

export class WebImageShare {
	private readonly shareImpl: ((data: ShareData) => Promise<void>) | undefined;

	public constructor(options: WebImageShareConstructorOptions = {}) {
		this.shareImpl = options.share;
	}

	public async shareFile(input: ShareFileInput): Promise<void> {
		const file = new File([new Uint8Array(input.bytes)], input.name, { type: sniffImageMime(input.bytes) });
		await this.share({ files: [file], title: input.name });
	}

	public async shareUrl(url: string): Promise<void> {
		await this.share({ url });
	}

	private async share(data: ShareData): Promise<void> {
		const share = this.shareImpl
			// eslint-disable-next-line n/no-unsupported-features/node-builtins -- web share API
			?? window.navigator.share.bind(window.navigator);
		if (typeof share !== 'function') {
			throw new Error(t('errors.webShareUnavailable'));
		}
		await share(data);
	}
}
