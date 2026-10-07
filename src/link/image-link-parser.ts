import type { ImageRef } from './image-ref.ts';

const DISPLAY_MATH_DELIMITER = '$$';
const FOOTNOTE_DEFINITION_RE = /^ {0,3}\[\^[^\]\n]+\]:/;
const FOOTNOTE_CONTINUATION_RE = /^(?:\t| {4,})/;
const INLINE_FOOTNOTE_OPEN = '^[';
const MAX_FENCE_INDENT = 3;
const MARKDOWN_TITLE_RE = /^(?:"[^"]*"|'[^']*'|\([^)]*\))/;
const MD_IMAGE_OPEN_RE = /!\[(?<alt>[^\]]*)\]\(/g;
const MIN_FENCE_LENGTH = 3;
const WHITESPACE_RE = /\s/;
const WIKI_IMAGE_RE = /!\[\[(?<target>[^\]|]+)(?:\|(?<suffix>[^\]]*))?\]\]/g;

interface MarkdownImageBody {
	end: number;
	markdownTitle: null | string;
	target: string;
}

interface MatchCandidate {
	index: number;
	ref: ImageRef;
}

interface OpeningFence {
	afterOpeningLine: number;
	char: string;
	length: number;
}

interface ProtectedRange {
	end: number;
	start: number;
}

export class ImageLinkParser {
	public parse(markdown: string): ImageRef[] {
		const protectedRanges = collectProtectedRanges(markdown);
		const candidates: MatchCandidate[] = [];
		for (const match of markdown.matchAll(MD_IMAGE_OPEN_RE)) {
			const index = match.index;
			const alt = match.groups?.['alt'] ?? '';
			const body = readMarkdownImageBody(markdown, index, match[0].length);
			if (body === null || isInsideProtectedRange(protectedRanges, index)) {
				continue;
			}
			candidates.push({
				index,
				ref: {
					decorations: splitDecorations(alt),
					end: body.end,
					isRemote: /^https?:\/\//i.test(body.target),
					kind: 'markdown',
					markdownTitle: body.markdownTitle,
					source: markdown.slice(index, body.end),
					start: index,
					target: body.target
				}
			});
		}
		for (const match of markdown.matchAll(WIKI_IMAGE_RE)) {
			const groups = match.groups;
			const target = groups?.['target']?.trim();
			const source = match[0];
			if (!target || !source || isInsideProtectedRange(protectedRanges, match.index)) {
				continue;
			}
			candidates.push({
				index: match.index,
				ref: {
					decorations: splitDecorations(groups?.['suffix'] ?? ''),
					end: match.index + source.length,
					isRemote: /^https?:\/\//i.test(target),
					kind: 'wiki',
					markdownTitle: null,
					source,
					start: match.index,
					target
				}
			});
		}
		candidates.sort((a, b) => a.index - b.index);
		return candidates.map((c) => c.ref);
	}
}

function atLineStart(markdown: string, index: number): boolean {
	return index === 0 || markdown[index - 1] === '\n';
}

function collectProtectedRanges(markdown: string): ProtectedRange[] {
	const ranges: ProtectedRange[] = [];
	let index = 0;
	while (index < markdown.length) {
		const range = readFence(markdown, index)
			?? readInlineCode(markdown, index)
			?? readDisplayMath(markdown, index)
			?? readInlineMath(markdown, index)
			?? readFootnoteDefinition(markdown, index)
			?? readInlineFootnote(markdown, index);
		if (range) {
			ranges.push(range);
			index = range.end;
			continue;
		}
		index += 1;
	}
	return ranges;
}

function isClosingFence(line: string, char: string, minLength: number): boolean {
	let index = 0;
	while (index < MAX_FENCE_INDENT && line[index] === ' ') {
		index += 1;
	}
	let length = 0;
	while (line[index] === char) {
		length += 1;
		index += 1;
	}
	return length >= minLength && line.slice(index).trim() === '';
}

function isDigit(char: string | undefined): boolean {
	return char !== undefined && char >= '0' && char <= '9';
}

function isInsideProtectedRange(ranges: readonly ProtectedRange[], index: number): boolean {
	return ranges.some((range) => index >= range.start && index < range.end);
}

function isMathWhitespace(char: string | undefined): boolean {
	return char === ' ' || char === '\t' || char === '\n';
}

function lineEndIndex(markdown: string, from: number): number {
	const newline = markdown.indexOf('\n', from);
	return newline === -1 ? markdown.length : newline;
}

function readDisplayMath(markdown: string, start: number): null | ProtectedRange {
	if (
		!markdown.startsWith(DISPLAY_MATH_DELIMITER, start)
		|| markdown[start - 1] === '\\'
	) {
		return null;
	}
	const close = markdown.indexOf(
		DISPLAY_MATH_DELIMITER,
		start + DISPLAY_MATH_DELIMITER.length
	);
	if (close === -1) {
		return null;
	}
	return { end: close + DISPLAY_MATH_DELIMITER.length, start };
}

function readFence(markdown: string, start: number): null | ProtectedRange {
	if (!atLineStart(markdown, start)) {
		return null;
	}
	const opening = readOpeningFence(markdown, start);
	if (!opening) {
		return null;
	}
	let lineStart = opening.afterOpeningLine;
	if (lineStart >= markdown.length) {
		return { end: markdown.length, start };
	}
	while (lineStart < markdown.length) {
		const lineEnd = lineEndIndex(markdown, lineStart);
		if (isClosingFence(markdown.slice(lineStart, lineEnd), opening.char, opening.length)) {
			return { end: lineEnd < markdown.length ? lineEnd + 1 : markdown.length, start };
		}
		lineStart = lineEnd < markdown.length ? lineEnd + 1 : markdown.length;
	}
	return { end: markdown.length, start };
}

function readFootnoteDefinition(markdown: string, start: number): null | ProtectedRange {
	if (!atLineStart(markdown, start)) {
		return null;
	}
	const firstLineEnd = lineEndIndex(markdown, start);
	if (!FOOTNOTE_DEFINITION_RE.test(markdown.slice(start, firstLineEnd))) {
		return null;
	}
	let end = firstLineEnd < markdown.length ? firstLineEnd + 1 : markdown.length;
	let lineStart = end;
	while (lineStart < markdown.length) {
		const lineEnd = lineEndIndex(markdown, lineStart);
		const line = markdown.slice(lineStart, lineEnd);
		if (!FOOTNOTE_CONTINUATION_RE.test(line)) {
			break;
		}
		end = lineEnd < markdown.length ? lineEnd + 1 : markdown.length;
		lineStart = end;
	}
	return { end, start };
}

function readInlineCode(markdown: string, start: number): null | ProtectedRange {
	if (markdown[start] !== '`') {
		return null;
	}
	let openLength = 0;
	while (markdown[start + openLength] === '`') {
		openLength += 1;
	}
	let index = start + openLength;
	while (index < markdown.length) {
		if (markdown[index] !== '`') {
			index += 1;
			continue;
		}
		let closeLength = 0;
		while (markdown[index + closeLength] === '`') {
			closeLength += 1;
		}
		if (closeLength === openLength) {
			return { end: index + closeLength, start };
		}
		index += closeLength;
	}
	return null;
}

function readInlineFootnote(markdown: string, start: number): null | ProtectedRange {
	if (!markdown.startsWith(INLINE_FOOTNOTE_OPEN, start)) {
		return null;
	}
	let depth = 1;
	let index = start + INLINE_FOOTNOTE_OPEN.length;
	while (index < markdown.length && depth > 0) {
		const char = markdown[index];
		if (char === '\n') {
			return null;
		}
		if (char === '[') {
			depth += 1;
		} else if (char === ']') {
			depth -= 1;
		}
		index += 1;
	}
	if (depth !== 0) {
		return null;
	}
	return { end: index, start };
}

function readInlineMath(markdown: string, start: number): null | ProtectedRange {
	if (
		markdown[start] !== '$'
		|| markdown.startsWith(DISPLAY_MATH_DELIMITER, start)
		|| markdown[start - 1] === '\\'
	) {
		return null;
	}
	const next = markdown[start + 1];
	if (next === undefined || isMathWhitespace(next)) {
		return null;
	}
	const limit = lineEndIndex(markdown, start + 1);
	for (let index = start + 1; index < limit; index += 1) {
		if (
			markdown[index] !== '$'
			|| markdown.startsWith(DISPLAY_MATH_DELIMITER, index)
			|| markdown[index - 1] === '\\'
		) {
			continue;
		}
		if (isMathWhitespace(markdown[index - 1]) || isDigit(markdown[index + 1])) {
			continue;
		}
		if (index === start + 1) {
			continue;
		}
		return { end: index + 1, start };
	}
	return null;
}

/**
 * Reads the body of `![alt](...)` starting right after the opening parenthesis.
 * Parentheses inside the target are matched by depth so that paths such as
 * `../images/语音增强(SE)/note/图.webp` are not truncated at the first `)`.
 * Whitespace only ends the target when it is followed by a Markdown title
 * or by the closing parenthesis, which keeps Obsidian's tolerance for
 * unencoded spaces in paths such as `../images/Flask 01：后端框架/x.webp`.
 */
function readMarkdownImageBody(
	markdown: string,
	start: number,
	openLength: number
): MarkdownImageBody | null {
	let index = skipSpaces(markdown, start + openLength);
	let target: string;
	if (markdown[index] === '<') {
		const close = markdown.indexOf('>', index + 1);
		if (close === -1) {
			return null;
		}
		target = markdown.slice(index + 1, close);
		index = close + 1;
	} else {
		const from = index;
		let depth = 0;
		while (index < markdown.length) {
			const char = markdown.charAt(index);
			if (char === '(') {
				depth += 1;
			} else if (char === ')') {
				if (depth === 0) {
					break;
				}
				depth -= 1;
			} else if (WHITESPACE_RE.test(char)) {
				// Obsidian 允许链接目标里出现未编码的空格，只有后面紧跟 Markdown title
				// 或收尾括号时，空白才表示目标结束。
				const next = skipSpaces(markdown, index);
				const nextChar = markdown.charAt(next);
				if (
					nextChar === ''
					|| nextChar === ')'
					|| nextChar === '"'
					|| nextChar === '\''
					|| nextChar === '('
				) {
					break;
				}
				index = next;
				continue;
			}
			index += 1;
		}
		target = markdown.slice(from, index);
	}
	if (target === '') {
		return null;
	}
	index = skipSpaces(markdown, index);
	const title = MARKDOWN_TITLE_RE.exec(markdown.slice(index));
	let markdownTitle: null | string = null;
	if (title) {
		markdownTitle = title[0];
		index = skipSpaces(markdown, index + title[0].length);
	}
	if (markdown[index] !== ')') {
		return null;
	}
	return {
		end: index + 1,
		markdownTitle,
		target
	};
}

function readOpeningFence(markdown: string, start: number): null | OpeningFence {
	let index = start;
	let indent = 0;
	while (indent < MAX_FENCE_INDENT && markdown[index] === ' ') {
		indent += 1;
		index += 1;
	}
	const char = markdown[index];
	if (char !== '`' && char !== '~') {
		return null;
	}
	let length = 0;
	while (markdown[index] === char) {
		length += 1;
		index += 1;
	}
	if (length < MIN_FENCE_LENGTH) {
		return null;
	}
	const infoEnd = lineEndIndex(markdown, index);
	if (char === '`' && markdown.slice(index, infoEnd).includes('`')) {
		return null;
	}
	return {
		afterOpeningLine: infoEnd < markdown.length ? infoEnd + 1 : markdown.length,
		char,
		length
	};
}

function skipSpaces(markdown: string, index: number): number {
	let cursor = index;
	while (cursor < markdown.length && WHITESPACE_RE.test(markdown.charAt(cursor))) {
		cursor += 1;
	}
	return cursor;
}

function splitDecorations(value: string): string[] {
	return value === '' ? [] : value.split('|');
}
