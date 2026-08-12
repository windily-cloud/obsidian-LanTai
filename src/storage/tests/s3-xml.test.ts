import {
	describe,
	expect,
	it
} from 'vitest';

import {
	parseListObjectsV2Xml,
	parseS3ErrorXml
} from '../s3-xml.ts';

const LIST_XML = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
	<Name>pics</Name>
	<IsTruncated>true</IsTruncated>
	<NextContinuationToken>images/cat.png</NextContinuationToken>
	<Contents>
		<Key>images/cat.png</Key>
		<LastModified>2026-08-01T12:00:00.000Z</LastModified>
		<ETag>&quot;abc123&quot;</ETag>
		<Size>42</Size>
	</Contents>
	<Contents>
		<Key>images/a &amp; b.png</Key>
		<LastModified>2026-08-02T12:00:00.000Z</LastModified>
		<Size>7</Size>
	</Contents>
</ListBucketResult>`;

describe('parseListObjectsV2Xml', () => {
	it('parses items, entities, and the next cursor', () => {
		expect(parseListObjectsV2Xml(LIST_XML)).toEqual({
			cursor: 'images/cat.png',
			items: [
				{ key: 'images/cat.png', lastModified: Date.parse('2026-08-01T12:00:00.000Z'), size: 42 },
				{ key: 'images/a & b.png', lastModified: Date.parse('2026-08-02T12:00:00.000Z'), size: 7 }
			]
		});
	});

	it('treats a non-truncated listing as the last page', () => {
		const xml = LIST_XML
			.replace('<IsTruncated>true</IsTruncated>', '<IsTruncated>false</IsTruncated>');
		expect(parseListObjectsV2Xml(xml).cursor).toBeUndefined();
	});

	it('treats IsTruncated with surrounding whitespace as truncated', () => {
		const xml = LIST_XML.replace(
			'<IsTruncated>true</IsTruncated>',
			'<IsTruncated>\n  true\n</IsTruncated>'
		);
		expect(parseListObjectsV2Xml(xml).cursor).toBe('images/cat.png');
	});

	it('parses an empty listing', () => {
		const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>`;
		expect(parseListObjectsV2Xml(xml)).toEqual({ items: [] });
	});
});

describe('parseS3ErrorXml', () => {
	it('extracts the S3 error code and message', () => {
		const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Error><Code>AccessDenied</Code><Message>Access Denied</Message></Error>`;
		expect(parseS3ErrorXml(xml)).toEqual({ code: 'AccessDenied', message: 'Access Denied' });
	});

	it('returns empty fields for non-XML bodies', () => {
		expect(parseS3ErrorXml('<html>Bad Gateway</html>')).toEqual({});
	});
});
