import type { GalleryImage } from '../storage/gallery-source.ts';

import { ImageLinkFormatter } from './image-link-formatter.ts';

export const GALLERY_DROP_EMBED_MIME = 'application/x-lantai-gallery-embed';

const formatter = new ImageLinkFormatter();

export interface GalleryEditorDropEvent {
	readonly dataTransfer: GalleryDropTransfer | null;
	preventDefault(): void;
}

interface FormatGalleryDropEmbedInput {
	readonly image: Pick<GalleryImage, 'key' | 'kind'>;
	readonly linkStyle: 'markdown' | 'wiki';
	readonly publicUrl: string;
}

interface GalleryDropFileList {
	readonly length: number;
}

interface GalleryDropTransfer {
	readonly files: GalleryDropFileList;
	getData(type: string): string;
}

export function formatGalleryDropEmbed(input: FormatGalleryDropEmbedInput): string {
	const target = input.image.kind === 'vault' ? input.image.key : input.publicUrl;
	return formatter.format({ linkStyle: input.linkStyle, target });
}

export function interceptGalleryEditorDrop(event: GalleryEditorDropEvent): null | string {
	const data = event.dataTransfer;
	if (!data) {
		return null;
	}
	const embed = data.getData(GALLERY_DROP_EMBED_MIME);
	if (!embed) {
		return null;
	}
	const hasFiles = data.files.length > 0;
	const hasUriList = data.getData('text/uri-list') !== '';
	if (!hasFiles && !hasUriList) {
		return null;
	}
	event.preventDefault();
	return embed;
}
