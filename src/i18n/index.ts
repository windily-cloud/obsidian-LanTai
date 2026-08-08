import { getLanguage } from 'obsidian';

import { en } from './en.ts';
import { zh } from './zh.ts';

export type I18nKey = `menu.${keyof typeof en.menu}`;

export type Locale = 'en' | 'zh';

export interface TOptions {
	readonly isMacOS?: boolean;
}

interface Dictionary {
	readonly menu: Record<keyof typeof en.menu, string>;
}

const LOCALES: Record<Locale, Dictionary> = {
	en,
	zh
};

export function resolveLocale(language = getLanguage()): Locale {
	const normalized = language.toLowerCase();
	if (normalized === 'zh' || normalized.startsWith('zh-')) {
		return 'zh';
	}
	return 'en';
}

export function t(key: I18nKey, options: TOptions = {}): string {
	const locale = resolveLocale();
	const dictionary = LOCALES[locale];

	if (key === 'menu.showInFolder') {
		if (locale === 'zh') {
			return options.isMacOS === false ? '在资源管理器中显示' : zh.menu.showInFolder;
		}
		return options.isMacOS === true ? 'Show in Finder' : en.menu.showInFolder;
	}

	return lookup(dictionary, key);
}

function lookup(dictionary: Dictionary, key: I18nKey): string {
	const parts = key.split('.');
	let current: unknown = dictionary;
	for (const part of parts) {
		if (current === null || typeof current !== 'object' || !(part in current)) {
			return key;
		}
		current = (current as Record<string, unknown>)[part];
	}
	return typeof current === 'string' ? current : key;
}
