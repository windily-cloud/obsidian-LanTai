import type { App } from 'obsidian';

import {
	Notice,
	SecretComponent,
	Setting
} from 'obsidian';

import type {
	LanTaiAccountClient,
	LanTaiAccountSummary,
	LanTaiImageFormat,
	LanTaiImageSettings
} from '../../../lantai/lantai-account.ts';

import { t } from '../../../i18n/index.ts';
import {
	apiKeysUrl,
	formatBytes,
	LANTAI_IMAGE_FORMATS,
	usagePercent
} from '../../../lantai/lantai-account.ts';
import {
	DEFAULT_LANTAI_BASE_URL,
	LANTAI_API_KEY_SECRET_NAME
} from '../../../lantai/lantai-credentials.ts';

export interface LanTaiAccountSectionContext {
	readonly app: App;
	readonly client: LanTaiAccountClient;
	getApiKey(): null | string;
	openUrl(url: string): void;
	redisplay(): void;
	setApiKey(value: null | string): void;
}

const FORMAT_LABELS: Readonly<Record<LanTaiImageFormat, string>> = {
	avif: 'AVIF',
	jpeg: 'JPEG',
	original: 'settings.lantaiFormatOriginal',
	png: 'PNG',
	webp: 'WebP'
};

const MAX_QUALITY = 100;
const MIN_QUALITY = 1;

/**
 * 兰台配置档卡片内的账号段：API Key（SecretComponent）+ 用量 + 图片压缩设置。
 *
 * 插件不发起登录、不签发 key——用户的凭证来自 web 控制台（见设计文档决策 2/3）。
 */
export function displayLanTaiAccountSection(
	containerEl: HTMLElement,
	ctx: LanTaiAccountSectionContext
): void {
	containerEl.empty();
	renderApiKey(containerEl, ctx);
	const apiKey = ctx.getApiKey();
	if (apiKey !== null && apiKey !== '') {
		renderSummaryHost(containerEl, ctx, apiKey);
	}
}

/** API Key 描述：只放一个「获取 API KEY」外链，不写多余文案。 */
function apiKeyLink(open: (url: string) => void): DocumentFragment {
	const fragment = createFragment();
	const url = apiKeysUrl(DEFAULT_LANTAI_BASE_URL);
	const link = createEl('a', { href: url, text: t('settings.lantaiGetKey') });
	link.addEventListener('click', (event) => {
		event.preventDefault();
		open(url);
	});
	fragment.appendChild(link);
	return fragment;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : t('errors.imageActionFailed');
}

function formatLabel(format: LanTaiImageFormat): string {
	const key = FORMAT_LABELS[format];
	return key.startsWith('settings.') ? t('settings.lantaiFormatOriginal') : key;
}

function renderApiKey(host: HTMLElement, ctx: LanTaiAccountSectionContext): void {
	// 与 S3 配置档的 Access Key / Secret Access Key 同一套交互（见 s3-section.ts 的
	// DisplaySecretField）：SecretComponent 显示已保存的密钥（掩码 + 清除），
	// 「更改」按钮打开 Obsidian 的密钥编辑器输入新值——输入入口在编辑器里，不是这一行的输入框。
	new Setting(host)
		.setName(t('settings.lantaiApiKey'))
		.setDesc(apiKeyLink((url) => {
			ctx.openUrl(url);
		}))
		.addComponent((el) =>
			new SecretComponent(ctx.app, el)
				.setValue(LANTAI_API_KEY_SECRET_NAME)
				.onChange(() => {
					// 值由组件写进 SecretStorage；重新渲染以便用量行反映新凭证。
					ctx.redisplay();
				})
		);
}

function renderSummary(
	host: HTMLElement,
	ctx: LanTaiAccountSectionContext,
	summary: LanTaiAccountSummary,
	apiKey: string
): void {
	new Setting(host).setName(t('settings.lantaiEmail')).setDesc(summary.email);
	new Setting(host)
		.setName(t('settings.lantaiPlan'))
		.setDesc(summary.plan.toUpperCase());
	renderUsageBar(host, t('settings.lantaiStorage'), summary.usedBytes, summary.quotaBytes, false);
	if (summary.trafficQuotaBytes > 0) {
		renderUsageBar(
			host,
			t('settings.lantaiTraffic'),
			summary.trafficUsedBytes,
			summary.trafficQuotaBytes,
			true
		);
	}

	new Setting(host)
		.setName(t('settings.lantaiImageSettings'))
		.setDesc(t('settings.lantaiImageSettingsDesc'))
		.addDropdown((dropdown) => {
			for (const format of LANTAI_IMAGE_FORMATS) {
				dropdown.addOption(format, formatLabel(format));
			}
			dropdown.setValue(summary.imageProcessingSettings.format).onChange((value) => {
				runAsync(saveImageSettings(ctx, apiKey, {
					format: value as LanTaiImageFormat,
					quality: summary.imageProcessingSettings.quality
				}));
			});
		});
	new Setting(host)
		.setName(t('settings.lantaiQuality'))
		.setDesc(String(summary.imageProcessingSettings.quality))
		.addSlider((slider) => {
			slider.setLimits(MIN_QUALITY, MAX_QUALITY, 1).setValue(summary.imageProcessingSettings.quality);
			slider.sliderEl.addEventListener('change', () => {
				runAsync(saveImageSettings(ctx, apiKey, {
					format: summary.imageProcessingSettings.format,
					quality: slider.getValue()
				}));
			});
		});

	const actions = new Setting(host);
	actions.addButton((button) => {
		button.setButtonText(t('settings.lantaiManageKeys')).onClick(() => {
			ctx.openUrl(apiKeysUrl(DEFAULT_LANTAI_BASE_URL));
		});
	});
	actions.addButton((button) => {
		button.setButtonText(t('settings.lantaiSignOut')).onClick(() => {
			// 仅清除本机凭证；服务端那把 key 仍需在网页端撤销（设计文档决策 7）。
			ctx.setApiKey(null);
			new Notice(t('notices.lantaiSignedOut'));
			ctx.redisplay();
		});
	});
}

function renderSummaryHost(
	host: HTMLElement,
	ctx: LanTaiAccountSectionContext,
	apiKey: string
): void {
	const loading = new Setting(host).setDesc(t('settings.lantaiChecking'));
	ctx.client
		.fetch(DEFAULT_LANTAI_BASE_URL, apiKey)
		.then((summary) => {
			loading.settingEl.remove();
			renderSummary(host, ctx, summary, apiKey);
		})
		.catch((error: unknown) => {
			loading.settingEl.remove();
			new Setting(host).setDesc(errorMessage(error));
		});
}

function renderUsageBar(
	parent: HTMLElement,
	name: string,
	used: number,
	quota: number,
	isTraffic: boolean
): void {
	const exhausted = quota > 0 && used >= quota;
	const usedLabel = formatBytes(used);
	const quotaLabel = formatBytes(quota);
	const desc = exhausted
		? t(isTraffic ? 'settings.lantaiTrafficExhausted' : 'settings.lantaiUsageExhausted', {
			quota: quotaLabel,
			used: usedLabel
		})
		: `${usedLabel} / ${quotaLabel}`;
	new Setting(parent)
		.setName(name)
		.setDesc(desc)
		.setClass('lantai-usage-setting')
		.addProgressBar((bar) => {
			bar.setValue(usagePercent(used, quota));
		});
}

/** 触发即忘的异步动作：失败只记日志，不再向上抛（设置页没有更合适的失败出口）。 */
function runAsync(task: Promise<unknown>): void {
	task.catch((error: unknown) => {
		console.error('LanTai account action failed', error);
	});
}

async function saveImageSettings(
	ctx: LanTaiAccountSectionContext,
	apiKey: string,
	settings: LanTaiImageSettings
): Promise<void> {
	try {
		await ctx.client.saveImageSettings(DEFAULT_LANTAI_BASE_URL, apiKey, settings);
		new Notice(t('notices.lantaiImageSettingsSaved'));
	} catch (error) {
		new Notice(errorMessage(error));
	}
}
