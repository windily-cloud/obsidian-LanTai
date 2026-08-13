import { Notice } from 'obsidian';

import type {
	ConfirmOverwrite,
	CoordinatedUploadMode
} from '../actions/upload-conflict-coordinator.ts';
import type { UploadConflictClass } from '../storage/classify-upload-conflict.ts';
import type { ObjectStorage } from '../storage/object-storage.ts';
import type { UploadHistoryStore } from '../storage/upload-history.ts';

import { coordinateUploadModes } from '../actions/upload-conflict-coordinator.ts';
import { t } from '../i18n/index.ts';
import { NameTemplateEngine } from '../path/name-template-engine.ts';
import { classifyUploadConflict } from '../storage/classify-upload-conflict.ts';

const UPLOAD_NOTICE_MS = 2000;

export interface GalleryUploadRequest {
	onUploaded(): void;
	readonly profileId: string;
	readonly storage: ObjectStorage;
	readonly template: string;
}

interface GalleryUploadCandidate {
	readonly bytes: Uint8Array;
	readonly classification: UploadConflictClass;
	readonly file: File;
	readonly key: string;
}

interface PickAndUploadGalleryImagesParams extends GalleryUploadRequest {
	readonly confirmOverwrite: ConfirmOverwrite;
	readonly history: UploadHistoryStore;
}

/** Opens the native file picker and uploads selected images. */
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

async function applyGalleryUpload(
	params: PickAndUploadGalleryImagesParams,
	candidate: GalleryUploadCandidate,
	mode: CoordinatedUploadMode
): Promise<'failed' | 'skipped' | 'uploaded'> {
	if (mode === 'skip') {
		return 'skipped';
	}
	if (mode === 'linkOnly') {
		return 'skipped';
	}
	try {
		new Notice(t('gallery.uploading', { name: candidate.file.name }), UPLOAD_NOTICE_MS);
		await params.storage.upload(candidate.key, candidate.bytes);
		const url = await params.storage.buildPublicUrl(candidate.key);
		await params.history.append({
			key: candidate.key,
			profileId: params.profileId,
			timestamp: Date.now(),
			url
		});
		return 'uploaded';
	} catch (error) {
		const message = error instanceof Error
			? error.message
			: t('gallery.uploadFailed', { name: candidate.file.name });
		new Notice(message);
		return 'failed';
	}
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

async function uploadSelectedFiles(
	params: PickAndUploadGalleryImagesParams,
	files: FileList | null
): Promise<void> {
	if (!files || files.length === 0) {
		return;
	}
	const engine = new NameTemplateEngine();
	const candidates: GalleryUploadCandidate[] = [];
	for (const file of Array.from(files)) {
		const key = buildKey(engine, params.template, file);
		const bytes = new Uint8Array(await file.arrayBuffer());
		const classification = await classifyUploadConflict({
			localBytes: bytes,
			objectKey: key,
			storage: params.storage
		});
		candidates.push({ bytes, classification, file, key });
	}

	const modes = await coordinateUploadModes({
		classes: candidates.map((candidate) => candidate.classification),
		confirmOverwrite: params.confirmOverwrite,
		sameMode: 'skip'
	});

	let uploaded = 0;
	let failed = 0;
	let skipped = 0;
	for (const [index, candidate] of candidates.entries()) {
		const mode = modes[index] ?? 'skip';
		const outcome = await applyGalleryUpload(params, candidate, mode);
		if (outcome === 'uploaded') {
			uploaded += 1;
		} else if (outcome === 'failed') {
			failed += 1;
		} else {
			skipped += 1;
		}
	}

	if (uploaded > 0) {
		params.onUploaded();
	}
	if (uploaded > 0 && failed === 0) {
		new Notice(t('gallery.uploadDone', { count: uploaded }));
	} else if (uploaded > 0 && failed > 0) {
		new Notice(t('gallery.uploadPartial', { failed, uploaded }));
	} else if (uploaded === 0 && failed === 0 && skipped > 0) {
		new Notice(t('gallery.uploadSkipped', { count: skipped }));
	}
}
