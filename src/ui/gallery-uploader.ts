import { Notice } from 'obsidian';

import type { ObjectStorage } from '../storage/object-storage.ts';
import type { UploadHistoryStore } from '../storage/upload-history.ts';

import { t } from '../i18n/index.ts';
import { NameTemplateEngine } from '../path/name-template-engine.ts';
import { probeObjectExists } from '../storage/probe-object-exists.ts';

const UPLOAD_NOTICE_MS = 2000;

export interface GalleryUploadRequest {
	onUploaded(): void;
	readonly profileId: string;
	readonly storage: ObjectStorage;
	readonly template: string;
}

export interface PickAndUploadGalleryImagesParams extends GalleryUploadRequest {
	readonly history: UploadHistoryStore;
}

/** Opens the native file picker and uploads selected images (no modal). */
export function pickAndUploadGalleryImages(params: PickAndUploadGalleryImagesParams): void {
	const input = createEl('input');
	input.type = 'file';
	input.multiple = true;
	input.accept = 'image/*';
	input.addEventListener('change', () => {
		uploadSelectedFiles(params, input.files)
			.catch((error: unknown) => {
				console.error('Failed to upload gallery files', error);
				new Notice(error instanceof Error ? error.message : t('errors.imageActionFailed'));
			})
			.finally(() => {
				input.value = '';
			});
	});
	input.click();
}

function buildKey(engine: NameTemplateEngine, template: string, file: File): string {
	const extensionIndex = file.name.lastIndexOf('.');
	const originalName = extensionIndex > 0 ? file.name.slice(0, extensionIndex) : file.name;
	const ext = extensionIndex > 0 ? file.name.slice(extensionIndex + 1) : '';
	return engine.evaluate(template, {
		ext,
		noteFileName: '',
		noteFilePath: '',
		noteFolderName: '',
		noteFolderPath: '',
		now: new Date(),
		originalName
	});
}

async function uploadOne(
	params: PickAndUploadGalleryImagesParams,
	engine: NameTemplateEngine,
	file: File
): Promise<void> {
	const key = buildKey(engine, params.template, file);
	if ((await probeObjectExists(params.storage, key)) === true) {
		throw new Error(t('gallery.fileExists', { key }));
	}
	const bytes = new Uint8Array(await file.arrayBuffer());
	await params.storage.upload(key, bytes);
	const url = await params.storage.buildPublicUrl(key);
	await params.history.append({
		key,
		profileId: params.profileId,
		timestamp: Date.now(),
		url
	});
}

async function uploadSelectedFiles(
	params: PickAndUploadGalleryImagesParams,
	files: FileList | null
): Promise<void> {
	if (!files || files.length === 0) {
		return;
	}
	const engine = new NameTemplateEngine();
	let uploaded = 0;
	let failed = 0;
	for (const file of Array.from(files)) {
		new Notice(t('gallery.uploading', { name: file.name }), UPLOAD_NOTICE_MS);
		try {
			await uploadOne(params, engine, file);
			uploaded += 1;
		} catch (error) {
			failed += 1;
			const message = error instanceof Error
				? error.message
				: t('gallery.uploadFailed', { name: file.name });
			new Notice(message);
		}
	}
	if (uploaded > 0) {
		params.onUploaded();
	}
	if (uploaded > 0 && failed === 0) {
		new Notice(t('gallery.uploadDone', { count: uploaded }));
	} else if (uploaded > 0 && failed > 0) {
		new Notice(t('gallery.uploadPartial', { failed, uploaded }));
	}
}
