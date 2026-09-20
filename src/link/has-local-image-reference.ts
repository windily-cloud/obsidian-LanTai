import type { ImageRef } from './image-ref.ts';

/** 排除正在处理的那一处引用（当前笔记路径 + 原文偏移）。 */
export interface ExcludeLocalImageRef {
	readonly noteFilePath: string;
	readonly start: number;
}

export interface HasLocalImageReferenceInput {
	readonly exclude?: ExcludeLocalImageRef;
	readonly localPath: string;
	readonly notes: readonly NoteImageContent[];
	parse(this: void, content: string): readonly ImageRef[];
	resolvePath(this: void, target: string, noteFilePath: string): null | string;
	/** 比较笔记路径是否为同一文件；缺省为严格相等。 */
	samePath?(this: void, left: string, right: string): boolean;
}

export interface NoteImageContent {
	readonly content: string;
	readonly path: string;
}

/**
 * 库内是否还有指向 `localPath` 的本地图片引用。
 * 远程 URL（含兰台雪花 CDN）一律不算本地引用；`exclude` 用于忽略正在上传的那一处。
 */
export function hasLocalImageReference(input: HasLocalImageReferenceInput): boolean {
	const samePath = input.samePath ?? ((left: string, right: string): boolean => left === right);
	for (const note of input.notes) {
		for (const ref of input.parse(note.content)) {
			if (ref.isRemote) {
				continue;
			}
			if (
				input.exclude !== undefined
				&& samePath(note.path, input.exclude.noteFilePath)
				&& ref.start === input.exclude.start
			) {
				continue;
			}
			if (input.resolvePath(ref.target, note.path) === input.localPath) {
				return true;
			}
		}
	}
	return false;
}
