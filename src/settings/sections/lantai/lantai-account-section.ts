import type { App } from 'obsidian';

import {
	Notice,
	SecretComponent,
	Setting
} from 'obsidian';
import { noopAsync } from 'obsidian-dev-utils/function';

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
import { DEFAULT_LANTAI_BASE_URL } from '../../../lantai/lantai-credentials.ts';

export interface LanTaiAccountSectionContext {
	readonly app: App;
	readonly client: LanTaiAccountClient;
	getApiKey(): null | string;
	getApiKeySecretName(): string;
	openUrl(url: string): void;
	redisplay(): void;
	setApiKeySecretName(name: string): void;
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
	// DisplaySecretField）：SecretComponent 只显示当前链接的密钥名，点「Link…」在
	// Obsidian 的密钥选择器里选已有密钥或新建——插件不在此行渲染输入框。
	new Setting(host)
		.setName(t('settings.lantaiApiKey'))
		.setDesc(apiKeyLink((url) => {
			ctx.openUrl(url);
		}))
		.addComponent((el) =>
			new SecretComponent(ctx.app, el)
				// SecretComponent.onChange 回传的是用户所选密钥的**名字**（不是值），
				// 必须把它存进 settings；插件只按名字取值，不要求用户输入任何指定名称。
				.setValue(ctx.getApiKeySecretName())
				.onChange((name) => {
					if (name === null || name === '') {
						return;
					}
					ctx.setApiKeySecretName(name);
					// 值由组件写进 SecretStorage；重新渲染以便用量行反映新凭证。
					ctx.redisplay();
				})
		);
}

/**
 * 输出格式 / 压缩质量两个控件共用一个本地快照。
 *
 * 保存必须发送**两个字段的完整当前值**：只改一个时不能拿首次渲染的 `summary` 兜另一个，
 * 否则后一次保存会把前一次的选择覆盖回去（格式改完再拖质量 → 格式被改回旧值）。
 * 写入串行排队，避免两个 PATCH 乱序落库。
 */
function renderImageSettings(
	host: HTMLElement,
	ctx: LanTaiAccountSectionContext,
	apiKey: string,
	initial: LanTaiImageSettings
): void {
	let current: LanTaiImageSettings = { ...initial };
	let saveQueue: Promise<void> = noopAsync();
	function persist(settings: LanTaiImageSettings): void {
		current = settings;
		saveQueue = saveQueue.then(() => saveImageSettings(ctx, apiKey, settings));
	}

	new Setting(host)
		.setName(t('settings.lantaiImageSettings'))
		.setDesc(t('settings.lantaiImageSettingsDesc'))
		.addDropdown((dropdown) => {
			for (const format of LANTAI_IMAGE_FORMATS) {
				dropdown.addOption(format, formatLabel(format));
			}
			dropdown.setValue(current.format).onChange((value) => {
				persist({ format: value as LanTaiImageFormat, quality: current.quality });
			});
		});

	const qualitySetting = new Setting(host)
		.setName(t('settings.lantaiQuality'))
		.setDesc(String(current.quality));
	qualitySetting.addSlider((slider) => {
		slider.setLimits(MIN_QUALITY, MAX_QUALITY, 1).setValue(current.quality);
		slider.sliderEl.addEventListener('input', () => {
			qualitySetting.setDesc(String(slider.getValue()));
		});
		slider.sliderEl.addEventListener('change', () => {
			persist({ format: current.format, quality: slider.getValue() });
		});
	});
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

	renderImageSettings(host, ctx, apiKey, summary.imageProcessingSettings);

	const actions = new Setting(host);
	actions.addButton((button) => {
		button.setButtonText(t('settings.lantaiManageKeys')).onClick(() => {
			ctx.openUrl(apiKeysUrl(DEFAULT_LANTAI_BASE_URL));
		});
	});
	actions.addButton((button) => {
		button.setButtonText(t('settings.lantaiSignOut')).onClick(() => {
			// 只解绑本机引用，不写空 SecretStorage 值：用户选的密钥可能与其他插件共享。
			// 服务端那把 key 仍需在网页端撤销（设计文档决策 7）。
			ctx.setApiKeySecretName('');
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

/** 保存图片处理设置；失败用 Notice 报错，不向上抛（串行队列继续处理后续写入）。 */
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
