import {
	describe,
	expect,
	it
} from 'vitest';

import {
	isEmptySearch,
	parseLanTaiSearchQuery
} from '../lantai-search-query.ts';

describe('parseLanTaiSearchQuery', () => {
	it('空串既无关键词也无标签', () => {
		expect(parseLanTaiSearchQuery('')).toEqual({ keyword: '', tag: '' });
		expect(isEmptySearch(parseLanTaiSearchQuery('   '))).toBe(true);
	});

	it('普通词拼成关键词', () => {
		expect(parseLanTaiSearchQuery('山湖 晨雾')).toEqual({ keyword: '山湖 晨雾', tag: '' });
		expect(isEmptySearch(parseLanTaiSearchQuery('山湖'))).toBe(false);
	});

	it('tag: 前缀词作为标签过滤', () => {
		expect(parseLanTaiSearchQuery('tag:风景')).toEqual({ keyword: '', tag: '风景' });
		expect(isEmptySearch(parseLanTaiSearchQuery('tag:风景'))).toBe(false);
	});

	it('标签与关键词可共存', () => {
		expect(parseLanTaiSearchQuery('tag:风景 山湖')).toEqual({ keyword: '山湖', tag: '风景' });
	});

	it('前缀大小写不敏感', () => {
		expect(parseLanTaiSearchQuery('TAG:风景')).toEqual({ keyword: '', tag: '风景' });
	});

	it('只识别第一个 tag:，后续出现按普通关键词处理（v1 不支持多标签）', () => {
		expect(parseLanTaiSearchQuery('tag:a tag:b')).toEqual({ keyword: 'tag:b', tag: 'a' });
	});

	it('裸 tag: 不当作标签', () => {
		expect(parseLanTaiSearchQuery('tag:')).toEqual({ keyword: 'tag:', tag: '' });
	});
});
