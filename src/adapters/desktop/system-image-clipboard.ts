import { t } from '../../i18n/index.ts';

interface DesktopWindow extends Window {
	require?(moduleName: string): unknown;
}

interface ElectronClipboard {
	writeImage(image: ElectronNativeImage): void;
}

interface ElectronModule {
	readonly clipboard: ElectronClipboard;
	readonly nativeImage: ElectronNativeImageFactory;
}

interface ElectronNativeImage {
	isEmpty(): boolean;
}

interface ElectronNativeImageFactory {
	createFromBuffer(buffer: Buffer): ElectronNativeImage;
}

interface SystemImageClipboardConstructorOptions {
	createFromBuffer?(buffer: Buffer): ElectronNativeImage;
	writeImage?(image: ElectronNativeImage): void;
}

export class SystemImageClipboard {
	private readonly createFromBuffer: ((buffer: Buffer) => ElectronNativeImage) | undefined;
	private readonly writeImage: ((image: ElectronNativeImage) => void) | undefined;

	public constructor(options: SystemImageClipboardConstructorOptions = {}) {
		this.createFromBuffer = options.createFromBuffer?.bind(options);
		this.writeImage = options.writeImage?.bind(options);
	}

	/** Copies image bytes to the system clipboard (Electron nativeImage). */
	public copy(bytes: Uint8Array): void {
		const electron = this.createFromBuffer && this.writeImage ? undefined : getElectron();
		const createFromBuffer = this.createFromBuffer
			?? electron?.nativeImage.createFromBuffer.bind(electron.nativeImage);
		const writeImage = this.writeImage
			?? electron?.clipboard.writeImage.bind(electron.clipboard);
		if (!createFromBuffer || !writeImage) {
			throw new Error(t('errors.electronClipboardUnavailable'));
		}
		const image = createFromBuffer(Buffer.from(bytes));
		if (image.isEmpty()) {
			throw new Error(t('errors.remoteNotDecodableAsImage'));
		}
		writeImage(image);
	}
}

function getElectron(): ElectronModule {
	const desktopWindow = window as DesktopWindow;
	const requireModule = desktopWindow.require?.bind(desktopWindow);
	if (!requireModule) {
		throw new Error(t('errors.electronClipboardUnavailable'));
	}
	return requireModule('electron') as ElectronModule;
}
