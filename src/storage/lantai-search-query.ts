export interface LanTaiSearchQuery {
	readonly keyword: string;
	readonly tag: string;
}

const TAG_PREFIX = 'tag:';

/** 既无关键词也无标签时，请求应退化为「列出全部」而不是「搜索」。 */
export function isEmptySearch(query: LanTaiSearchQuery): boolean {
	return query.keyword === '' && query.tag === '';
}

/**
 * 解析兰台源的搜索框语法：`tag:<名称>` 前缀词作为标签过滤，其余词拼成关键词。
 *
 * 标签名不含空格（与后端 tag 规范化一致）；多标签第一版不支持——后端 `search` 只收单个 `tag`。
 * 前缀词最多识别一个，后续出现的 `tag:` 词按普通关键词处理，避免用户以为支持多标签。
 */
export function parseLanTaiSearchQuery(raw: string): LanTaiSearchQuery {
	const words = raw.split(/\s+/u).filter((word) => word !== '');
	let tag = '';
	const rest: string[] = [];
	for (const word of words) {
		if (
			tag === ''
			&& word.length > TAG_PREFIX.length
			&& word.slice(0, TAG_PREFIX.length).toLowerCase() === TAG_PREFIX
		) {
			tag = word.slice(TAG_PREFIX.length);
			continue;
		}
		rest.push(word);
	}
	return { keyword: rest.join(' '), tag };
}
