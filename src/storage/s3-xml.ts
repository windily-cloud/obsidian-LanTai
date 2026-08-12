import type { ObjectStorageFile } from './object-storage.ts';

export interface S3ErrorFields {
	readonly code?: string;
	readonly message?: string;
}

export interface S3ListPage {
	readonly cursor?: string;
	readonly items: ObjectStorageFile[];
}

const XML_CONTENTS_RE = /<Contents>(?<block>[\s\S]*?)<\/Contents>/gu;
const XML_KEY_RE = /<Key>(?<value>[^<]*)<\/Key>/u;
const XML_SIZE_RE = /<Size>(?<value>[^<]*)<\/Size>/u;
const XML_LAST_MODIFIED_RE = /<LastModified>(?<value>[^<]*)<\/LastModified>/u;
const XML_IS_TRUNCATED_RE = /<IsTruncated>\s*true\s*<\/IsTruncated>/u;
const XML_NEXT_TOKEN_RE = /<NextContinuationToken>(?<value>[^<]*)<\/NextContinuationToken>/u;
const XML_CODE_RE = /<Code>(?<value>[^<]*)<\/Code>/u;
const XML_MESSAGE_RE = /<Message>(?<value>[^<]*)<\/Message>/u;
const XML_ENTITY_RE = /&(?:amp|lt|gt|quot|apos|#(?<decimal>\d+)|#x(?<hex>[\dA-Fa-f]+));/gu;

const XML_NAMED_ENTITIES: Readonly<Record<string, string>> = {
	'&amp;': '&',
	'&apos;': '\'',
	'&gt;': '>',
	'&lt;': '<',
	'&quot;': '"'
};

const HEX_RADIX = 16;

interface XmlEntityMatchGroups {
	readonly decimal?: string;
	readonly hex?: string;
}

export function parseListObjectsV2Xml(xml: string): S3ListPage {
	const items: ObjectStorageFile[] = [];
	for (const match of xml.matchAll(XML_CONTENTS_RE)) {
		const block = match.groups?.['block'] ?? '';
		const rawKey = XML_KEY_RE.exec(block)?.groups?.['value'];
		if (rawKey === undefined) {
			continue;
		}
		const lastModified = parseTimestamp(XML_LAST_MODIFIED_RE.exec(block)?.groups?.['value']);
		items.push({
			key: decodeXmlText(rawKey),
			...(lastModified === undefined ? {} : { lastModified }),
			size: Number(XML_SIZE_RE.exec(block)?.groups?.['value'] ?? 0)
		});
	}
	const nextToken = XML_NEXT_TOKEN_RE.exec(xml)?.groups?.['value'];
	return {
		...(XML_IS_TRUNCATED_RE.test(xml) && nextToken
			? { cursor: decodeXmlText(nextToken) }
			: {}),
		items
	};
}

export function parseS3ErrorXml(xml: string): S3ErrorFields {
	const code = XML_CODE_RE.exec(xml)?.groups?.['value'];
	const message = XML_MESSAGE_RE.exec(xml)?.groups?.['value'];
	return {
		...(code === undefined ? {} : { code: decodeXmlText(code) }),
		...(message === undefined ? {} : { message: decodeXmlText(message) })
	};
}

function decodeXmlText(text: string): string {
	return text.replace(XML_ENTITY_RE, (entity, ...rest) => {
		const groups = rest[rest.length - 1] as undefined | XmlEntityMatchGroups;
		const decimal = groups?.decimal;
		const hex = groups?.hex;
		if (decimal) {
			return String.fromCodePoint(Number(decimal));
		}
		if (hex) {
			return String.fromCodePoint(Number.parseInt(hex, HEX_RADIX));
		}
		return XML_NAMED_ENTITIES[entity] ?? entity;
	});
}

function parseTimestamp(value: string | undefined): number | undefined {
	if (!value) {
		return undefined;
	}
	const parsed = Date.parse(value);
	return Number.isNaN(parsed) ? undefined : parsed;
}
