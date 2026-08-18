import {
	describe,
	expect,
	it
} from 'vitest';

import type { GalleryImage } from '../../storage/gallery-source.ts';

import {
	formatGalleryDropEmbed,
	GALLERY_DROP_EMBED_MIME,
	interceptGalleryEditorDrop
} from '../gallery-drop-embed.ts';

interface DropEventFixture {
	dataTransfer: GalleryDropTransfer;
	defaultPrevented: boolean;
	preventDefault(): void;
}

interface DropEventOptions {
	readonly fileCount?: number;
}

interface GalleryDropFileList {
	readonly length: number;
}

interface GalleryDropTransfer {
	readonly files: GalleryDropFileList;
	getData(type: string): string;
}

describe('formatGalleryDropEmbed', () => {
	it('uses wiki embed for vault images when link style is wiki', () => {
		expect(
			formatGalleryDropEmbed({
				image: vaultImage('Notes/cat.png'),
				linkStyle: 'wiki',
				publicUrl: 'app://local/Notes/cat.png'
			})
		).toBe('![[Notes/cat.png]]');
	});

	it('uses markdown embed for vault images when link style is markdown', () => {
		expect(
			formatGalleryDropEmbed({
				image: vaultImage('Notes/cat.png'),
				linkStyle: 'markdown',
				publicUrl: 'app://local/Notes/cat.png'
			})
		).toBe('![](Notes/cat.png)');
	});

	it('forces markdown for recent remote images even when style is wiki', () => {
		expect(
			formatGalleryDropEmbed({
				image: remoteImage('recent', 'uploads/cat.png'),
				linkStyle: 'wiki',
				publicUrl: 'https://cdn.example.com/uploads/cat.png'
			})
		).toBe('![](https://cdn.example.com/uploads/cat.png)');
	});

	it('forces markdown for bucket remote images even when style is wiki', () => {
		expect(
			formatGalleryDropEmbed({
				image: remoteImage('bucket', 'uploads/cat.png'),
				linkStyle: 'wiki',
				publicUrl: 'https://cdn.example.com/uploads/cat.png'
			})
		).toBe('![](https://cdn.example.com/uploads/cat.png)');
	});
});

describe('interceptGalleryEditorDrop', () => {
	it('lets native text insertion proceed when only the embed payload is present', () => {
		const event = dropEvent({
			[GALLERY_DROP_EMBED_MIME]: '![](https://cdn.example.com/cat.png)',
			'text/plain': '![](https://cdn.example.com/cat.png)'
		});
		expect(interceptGalleryEditorDrop(event)).toBeNull();
		expect(event.defaultPrevented).toBe(false);
	});

	it('inserts the embed and prevents default when the drop also carries files', () => {
		const event = dropEvent(
			{
				[GALLERY_DROP_EMBED_MIME]: '![[Notes/cat.png]]',
				'text/plain': '![[Notes/cat.png]]'
			},
			{ fileCount: 1 }
		);
		expect(interceptGalleryEditorDrop(event)).toBe('![[Notes/cat.png]]');
		expect(event.defaultPrevented).toBe(true);
	});

	it('inserts the embed and prevents default when the drop also carries a uri-list', () => {
		const event = dropEvent({
			[GALLERY_DROP_EMBED_MIME]: '![](https://cdn.example.com/cat.png)',
			'text/plain': '![](https://cdn.example.com/cat.png)',
			'text/uri-list': 'https://cdn.example.com/cat.png'
		});
		expect(interceptGalleryEditorDrop(event)).toBe(
			'![](https://cdn.example.com/cat.png)'
		);
		expect(event.defaultPrevented).toBe(true);
	});

	it('ignores drops that are not from the gallery', () => {
		const event = dropEvent({ 'text/plain': 'https://cdn.example.com/cat.png' });
		expect(interceptGalleryEditorDrop(event)).toBeNull();
		expect(event.defaultPrevented).toBe(false);
	});
});

function dropEvent(
	payload: Record<string, string>,
	options: DropEventOptions = {}
): DropEventFixture {
	const event: DropEventFixture = {
		dataTransfer: {
			files: { length: options.fileCount ?? 0 },
			getData(type: string): string {
				return payload[type] ?? '';
			}
		},
		defaultPrevented: false,
		preventDefault(): void {
			event.defaultPrevented = true;
		}
	};
	return event;
}

function remoteImage(kind: 'bucket' | 'recent', key: string): GalleryImage {
	return {
		key,
		kind,
		name: key.split('/').at(-1) ?? key
	};
}

function vaultImage(key: string): GalleryImage {
	return {
		key,
		kind: 'vault',
		name: key.split('/').at(-1) ?? key
	};
}
