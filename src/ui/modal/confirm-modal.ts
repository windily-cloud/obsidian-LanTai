import type { App } from 'obsidian';

import {
	Modal,
	Setting
} from 'obsidian';

import { t } from '../../i18n/index.ts';

interface ConfirmActionParams {
	readonly app: App;
	readonly confirmText?: string;
	readonly message: string;
	readonly title: string;
	readonly warning?: boolean;
}

interface ConfirmModalConstructorParams extends ConfirmActionParams {
	onDecide(confirmed: boolean): void;
}

class ConfirmModal extends Modal {
	private decided = false;
	private readonly onDecide: (confirmed: boolean) => void;
	private readonly params: ConfirmActionParams;

	public constructor(params: ConfirmModalConstructorParams) {
		super(params.app);
		this.params = params;
		this.onDecide = (confirmed: boolean): void => {
			params.onDecide(confirmed);
		};
	}

	public override onClose(): void {
		this.contentEl.empty();
		if (!this.decided) {
			this.onDecide(false);
		}
	}

	public override onOpen(): void {
		this.setTitle(this.params.title);
		this.contentEl.createEl('p', { text: this.params.message });
		new Setting(this.contentEl)
			.addButton((button) =>
				button.setButtonText(t('settings.cancel')).onClick(() => {
					this.decide(false);
				})
			)
			.addButton((button) => {
				const confirm = button
					.setButtonText(this.params.confirmText ?? t('settings.confirm'))
					.onClick(() => {
						this.decide(true);
					});
				if (this.params.warning === true) {
					confirm.setWarning();
				}
			});
	}

	private decide(confirmed: boolean): void {
		this.decided = true;
		this.onDecide(confirmed);
		this.close();
	}
}

/** 通用二次确认。确定返回 true，取消或直接关闭返回 false。 */
export function confirmAction(params: ConfirmActionParams): Promise<boolean> {
	return new Promise((resolve) => {
		const modal = new ConfirmModal({ ...params, onDecide: resolve });
		modal.open();
	});
}
