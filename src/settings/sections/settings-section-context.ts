import type { App } from 'obsidian';

import type { AttachmentPathResolver } from '../../path/attachment-path-resolver.ts';
import type { PluginSettings } from '../plugin-settings.ts';

export interface SettingsSectionContext {
	readonly app: App;
	readonly pathResolver: AttachmentPathResolver;
	persist(): void;
	persistAndRedisplay(): void;
	redisplay(): void;
	readonly settings: PluginSettings;
}
