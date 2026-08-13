import type { App } from 'obsidian';

import {
	Modal,
	Setting
} from 'obsidian';

import { t } from '../i18n/index.ts';

interface OverwriteConfirmModalConstructorParams extends OverwriteConfirmModalParams {
	onDecide(overwrite: boolean): void;
}

interface OverwriteConfirmModalParams {
	readonly app: App;
	readonly differentCount: number;
}

class OverwriteConfirmModal extends Modal {
	private decided = false;
	private readonly differentCount: number;
	private readonly onDecide: (overwrite: boolean) => void;

	public constructor(params: OverwriteConfirmModalConstructorParams) {
		super(params.app);
		this.differentCount = params.differentCount;
		this.onDecide = (overwrite: boolean): void => {
			params.onDecide(overwrite);
		};
	}

	public override onClose(): void {
		this.contentEl.empty();
		if (!this.decided) {
			this.onDecide(false);
		}
	}

	public override onOpen(): void {
		this.setTitle(t('overwriteConfirm.title'));
		this.contentEl.createEl('p', {
			text: this.differentCount === 1
				? t('overwriteConfirm.descriptionOne')
				: t('overwriteConfirm.descriptionMany', { count: this.differentCount })
		});
		new Setting(this.contentEl)
			.addButton((button) =>
				button.setButtonText(t('overwriteConfirm.cancel')).onClick(() => {
					this.decided = true;
					this.onDecide(false);
					this.close();
				})
			)
			.addButton((button) =>
				button
					.setButtonText(t('overwriteConfirm.overwrite'))
					.setWarning()
					.onClick(() => {
						this.decided = true;
						this.onDecide(true);
						this.close();
					})
			);
	}
}

/**
 * Asks whether to overwrite remote objects that differ from the local bytes.
 * Resolves true on Overwrite, false on Cancel / dismiss.
 */
export function confirmOverwriteImages(
	app: App,
	differentCount: number
): Promise<boolean> {
	return new Promise((resolve) => {
		const modal = new OverwriteConfirmModal({
			app,
			differentCount,
			onDecide: resolve
		});
		modal.open();
	});
}
