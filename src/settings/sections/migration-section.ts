import { Platform } from 'obsidian';

/** Exposed for unit tests and settings definition gating. */
export function shouldShowMigrationSettings(isMobile: boolean = Platform.isMobile): boolean {
	return !isMobile;
}
