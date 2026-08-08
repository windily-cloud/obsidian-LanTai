import { getLanguage } from 'obsidian';

import { en } from './en.ts';
import { zh } from './zh.ts';

export type I18nKey =
	| `commands.${keyof typeof en.commands}`
	| `errors.${keyof typeof en.errors}`
	| `gallery.${keyof typeof en.gallery}`
	| `menu.${keyof typeof en.menu}`
	| `notices.${keyof typeof en.notices}`
	| `settings.${keyof typeof en.settings}`;

type Dictionary = typeof en;

type InterpolationVars = Record<string, boolean | number | string | undefined>;

type Locale = 'en' | 'zh';

interface TOptions extends InterpolationVars {
	readonly isMacOS?: boolean;
}

const LOCALES: Record<Locale, Dictionary> = {
	en,
	zh: zh as Dictionary
};

export function t(key: I18nKey, options: TOptions = {}): string {
	const locale = resolveLocale();
	const dictionary = LOCALES[locale];

	if (key === 'menu.showInFolder') {
		if (locale === 'zh') {
			return options.isMacOS === false ? '在资源管理器中显示' : zh.menu.showInFolder;
		}
		return options.isMacOS === true ? 'Show in Finder' : en.menu.showInFolder;
	}

	const { isMacOS: _isMacOS, ...vars } = options;
	return interpolate(lookup(dictionary, key), vars);
}

function interpolate(template: string, vars: InterpolationVars): string {
	return template.replace(/\{\w+\}/gu, (match) => {
		const name = match.slice(1, -1);
		const value = vars[name];
		return value === undefined ? match : String(value);
	});
}

function lookup(dictionary: Dictionary, key: I18nKey): string {
	const [sectionName, itemName] = key.split('.') as [keyof Dictionary, string];
	const section = dictionary[sectionName] as Record<string, unknown>;
	const value = section[itemName];
	return typeof value === 'string' ? value : key;
}

function resolveLocale(language?: string): Locale {
	let resolved = language;
	if (resolved === undefined) {
		try {
			resolved = typeof getLanguage === 'function' ? getLanguage() : 'en';
		} catch {
			return 'en';
		}
	}
	const normalized = resolved.toLowerCase();
	if (normalized === 'zh' || normalized.startsWith('zh-')) {
		return 'zh';
	}
	return 'en';
}
