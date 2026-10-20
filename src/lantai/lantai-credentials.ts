/**
 * 兰台 API key 在 SecretStorage 中的默认键名。
 *
 * 用户在 `SecretComponent` 里可以选择任意已有密钥或自建密钥，插件保存的是**所选密钥名**；
 * 该常量只作为旧版设置（data.json 尚无 `lanTaiApiKeySecretName`）的兼容回退。
 */
export const LANTAI_API_KEY_SECRET_NAME = 'lantai-api-key';

/**
 * 把 settings 里保存的密钥名解析为最终使用的 SecretStorage 键名。
 *
 * - `null` / `undefined`：旧版 data.json 没有该字段，回退默认名。
 * - 其它值：只 trim，不校验命名——用户选什么名字就用什么名字。
 * - `''`：用户显式解绑，保持空串（读取侧视为未配置）。
 */
export function resolveLanTaiApiKeySecretName(
	stored: null | string | undefined
): string {
	if (stored === null || stored === undefined) {
		return LANTAI_API_KEY_SECRET_NAME;
	}
	return stored.trim();
}

/** 兰台官方服务地址默认值。 */
export const DEFAULT_LANTAI_BASE_URL = 'https://lantai.pkmer.cn';

/** 网页端「API Keys」分栏的直达路径（见 apps/web/src/routes/_app/settings.tsx）。 */
export const LANTAI_API_KEYS_PATH = '/settings?tab=api-keys';
