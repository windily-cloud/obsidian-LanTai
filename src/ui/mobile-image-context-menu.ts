export type MobileImageContextMenuAction = 'pass' | 'show' | 'suppress';

interface MobileImageContextMenuInput {
	readonly hitSourceImage: boolean;
	readonly isPreviewMode: boolean;
	readonly menuAlreadyShown: boolean;
}

/**
 * Mobile-only decision for a contextmenu event on the markdown source view.
 * `pass` leaves the event alone (non-image / reading mode).
 * `suppress` blocks the native drawer after LanTai already showed a menu.
 * `show` blocks the native drawer and opens the LanTai menu.
 */
export function resolveMobileImageContextMenu(
	input: MobileImageContextMenuInput
): MobileImageContextMenuAction {
	if (!input.hitSourceImage || input.isPreviewMode) {
		return 'pass';
	}
	if (input.menuAlreadyShown) {
		return 'suppress';
	}
	return 'show';
}
