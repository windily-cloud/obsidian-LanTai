import type { App } from 'obsidian';

import {
	Modal,
	Notice,
	Setting
} from 'obsidian';

import type { ImageLinkParser } from '../../link/image-link-parser.ts';
import type { MigrationPlanStore } from '../../migration/migration-plan-store.ts';
import type { MigrationPlan } from '../../migration/migration-plan.ts';
import type { MigrationRunner } from '../../migration/migration-runner.ts';
import type { MigrationScanVault } from '../../migration/migration-scanner.ts';
import type { StorageProfile } from '../../settings/sections/s3/storage-profile.ts';

import { t } from '../../i18n/index.ts';
import { formatBytes } from '../../lantai/lantai-account.ts';
import {
	addMigrationFolder,
	assertMigrationFoldersExist,
	availableMigrationFolderPaths,
	isAllFolders,
	MIGRATION_ALL_FOLDERS,
	migrationFolderLabel,
	resolveMigrationFolders
} from '../../migration/migration-folders.ts';
import { scanMigrationPlan } from '../../migration/migration-scanner.ts';
import {
	buildMigrationUrlPattern,
	migrationProfileBlockReason
} from '../../migration/migration-url-pattern.ts';
import { confirmAction } from './confirm-modal.ts';

interface OpenMigrationModalParams {
	readonly app: App;
	getActiveProfile(): null | StorageProfile;
	openPlanFile(): Promise<void>;
	readonly parser: ImageLinkParser;
	readonly runner: MigrationRunner;
	readonly scanVault: MigrationScanVault;
	readonly store: MigrationPlanStore;
}

type WizardPhase = 'review' | 'running' | 'scanned' | 'setup';

const FOLDER_PICKER_NONE = '__none__';

class MigrationModal extends Modal {
	private backupConfirmed = false;
	private deleteSourceAfterUpload = false;
	private error: null | string = null;
	private folders: string[] = [];
	private readonly params: OpenMigrationModalParams;
	private paused = false;
	private phase: WizardPhase = 'setup';
	private plan: MigrationPlan | null = null;
	private progressPath = '';
	private running = false;

	public constructor(params: OpenMigrationModalParams) {
		super(params.app);
		this.params = params;
	}

	public override onClose(): void {
		this.paused = true;
		this.contentEl.empty();
	}

	public override onOpen(): void {
		this.setTitle(t('migration.title'));
		this.runAsync(this.bootstrap());
	}

	private async bootstrap(): Promise<void> {
		const loaded = await this.params.store.load();
		if (!loaded.ok) {
			this.phase = 'review';
			this.error = t('migration.invalidPlan');
			this.render();
			return;
		}
		if (loaded.plan) {
			this.plan = loaded.plan;
			this.folders = [...loaded.plan.folders];
			this.deleteSourceAfterUpload = loaded.plan.deleteSourceAfterUpload;
			this.backupConfirmed = true;
			this.phase = loaded.plan.status === 'scanned' ? 'scanned' : 'review';
		}
		this.render();
	}

	private async discard(): Promise<void> {
		const confirmed = await confirmAction({
			app: this.app,
			message: t('migration.discardConfirmMessage'),
			title: t('migration.discardConfirmTitle'),
			warning: true
		});
		if (!confirmed) {
			return;
		}
		await this.params.store.delete();
		this.plan = null;
		this.phase = 'setup';
		this.error = null;
		this.render();
	}

	private async execute(): Promise<void> {
		if (!this.plan || this.running) {
			return;
		}
		this.paused = false;
		this.running = true;
		this.phase = 'running';
		this.render();
		try {
			const plan = await this.params.runner.run({
				onProgress: (progress): void => {
					this.progressPath = progress.currentPath;
					if (this.plan) {
						this.plan.stats.doneCount = progress.done;
					}
					if (this.phase === 'running') {
						this.render();
					}
				},
				plan: this.plan,
				shouldPause: (): boolean => this.paused
			});
			this.plan = plan;
			this.phase = 'review';
			if (plan.status === 'completed') {
				new Notice(t('migration.completed'));
			}
		} catch (error) {
			this.error = error instanceof Error ? error.message : t('errors.imageActionFailed');
			this.phase = 'review';
		} finally {
			this.running = false;
			this.render();
		}
	}

	private hasExecutableItems(plan: MigrationPlan): boolean {
		return plan.items.some((item) => item.status !== 'done' && !item.localPath.startsWith('unresolved:'));
	}

	private async openJson(): Promise<void> {
		try {
			await this.params.openPlanFile();
		} catch (error) {
			this.error = error instanceof Error ? error.message : t('errors.openWithDefaultUnavailable');
			this.render();
		}
	}

	private profileBlock(): null | string {
		return migrationProfileBlockReason(this.params.getActiveProfile());
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		const profile = this.params.getActiveProfile();
		const block = this.profileBlock();
		if (profile) {
			contentEl.createEl('p', {
				text: t('migration.profile', { name: profile.name })
			});
			if (this.phase === 'setup' || this.plan === null) {
				contentEl.createEl('p', {
					text: `${t('migration.urlPattern')}: ${buildMigrationUrlPattern(profile)}`
				});
			}
		}
		if (block) {
			contentEl.createEl('p', { cls: 'mod-warning', text: block });
		}
		if (this.error) {
			contentEl.createEl('p', { cls: 'mod-warning', text: this.error });
		}

		if (this.phase === 'setup') {
			this.renderSetup(block !== null);
			return;
		}
		if (this.phase === 'scanned' && this.plan) {
			this.renderScanned(this.plan, block !== null);
			return;
		}
		if (this.phase === 'running' && this.plan) {
			this.renderRunning(this.plan);
			return;
		}
		if (this.plan) {
			this.renderReview(this.plan);
			return;
		}
		this.renderSetup(block !== null);
	}

	private renderFolderPicker(): void {
		const picker = new Setting(this.contentEl)
			.setName(t('migration.folders'))
			.setDesc(t('migration.foldersDesc'));
		if (!this.folders.some(isAllFolders)) {
			picker.addDropdown((dropdown) => {
				dropdown.addOption(FOLDER_PICKER_NONE, t('migration.addFolder'));
				dropdown.addOption(MIGRATION_ALL_FOLDERS, t('migration.allFolders'));
				for (
					const path of availableMigrationFolderPaths(
						this.app.vault.getAllFolders(false).map((folder) => folder.path),
						this.folders,
						this.app.vault.configDir
					)
				) {
					dropdown.addOption(path, path);
				}
				dropdown.setValue(FOLDER_PICKER_NONE).onChange((value) => {
					if (value === FOLDER_PICKER_NONE) {
						return;
					}
					this.folders = addMigrationFolder(this.folders, value);
					this.render();
				});
			});
		}
		for (const folder of this.folders) {
			new Setting(this.contentEl)
				.setName(migrationFolderLabel(folder))
				.addExtraButton((button) => {
					button
						.setIcon('x')
						.setTooltip(t('migration.removeFolder'))
						.onClick(() => {
							this.folders = this.folders.filter((path) => path !== folder);
							this.render();
						});
				});
		}
	}

	private renderReview(plan: MigrationPlan): void {
		this.renderStats(plan);
		this.contentEl.createEl('p', {
			text: t('migration.review', {
				done: plan.stats.doneCount,
				failed: plan.stats.failedCount
			})
		});
		if (plan.status === 'completed') {
			this.contentEl.createEl('p', { text: t('migration.completed') });
		} else {
			this.contentEl.createEl('p', { text: t('migration.resumeMessage') });
		}
		new Setting(this.contentEl)
			.addButton((button) =>
				button.setButtonText(t('migration.openJson')).onClick(() => {
					this.runAsync(this.openJson());
				})
			)
			.addButton((button) =>
				button
					.setButtonText(t('migration.continue'))
					.setCta()
					.setDisabled(this.profileBlock() !== null || !this.hasExecutableItems(plan))
					.onClick(() => {
						this.runAsync(this.execute());
					})
			)
			.addButton((button) =>
				button.setButtonText(t('migration.discard')).setWarning().onClick(() => {
					this.runAsync(this.discard());
				})
			);
	}

	private renderRunning(plan: MigrationPlan): void {
		this.renderStats(plan);
		this.contentEl.createEl('p', {
			text: t('migration.progress', {
				done: plan.stats.doneCount,
				total: plan.items.length
			})
		});
		if (this.progressPath) {
			this.contentEl.createEl('p', {
				text: t('migration.currentFile', { path: this.progressPath })
			});
		}
		this.contentEl.createEl('p', { text: t('migration.pauseHint') });
	}

	private renderScanned(plan: MigrationPlan, blocked: boolean): void {
		this.renderStats(plan);
		this.contentEl.createEl('p', { text: t('migration.closeHint') });
		new Setting(this.contentEl)
			.addButton((button) =>
				button.setButtonText(t('migration.openJson')).onClick(() => {
					this.runAsync(this.openJson());
				})
			)
			.addButton((button) =>
				button
					.setButtonText(t('migration.execute'))
					.setCta()
					.setDisabled(blocked || !this.hasExecutableItems(plan))
					.onClick(() => {
						this.runAsync(this.execute());
					})
			)
			.addButton((button) =>
				button.setButtonText(t('migration.discard')).setWarning().onClick(() => {
					this.runAsync(this.discard());
				})
			);
	}

	private renderSetup(blocked: boolean): void {
		this.contentEl.createEl('p', { text: t('migration.backupWarning') });
		new Setting(this.contentEl)
			.setName(t('migration.backupConfirm'))
			.addToggle((toggle) => {
				toggle.setValue(this.backupConfirmed).onChange((value) => {
					this.backupConfirmed = value;
					this.render();
				});
			});
		this.renderFolderPicker();
		new Setting(this.contentEl)
			.setName(t('migration.deleteLocal'))
			.setDesc(t('migration.deleteLocalDesc'))
			.addToggle((toggle) => {
				toggle.setValue(this.deleteSourceAfterUpload).onChange((value) => {
					this.deleteSourceAfterUpload = value;
				});
			});
		new Setting(this.contentEl)
			.addButton((button) =>
				button
					.setButtonText(t('migration.scan'))
					.setCta()
					.setDisabled(blocked || !this.backupConfirmed || this.folders.length === 0)
					.onClick(() => {
						this.runAsync(this.scan());
					})
			);
	}

	private renderStats(plan: MigrationPlan): void {
		this.contentEl.createEl('p', {
			text: `${t('migration.urlPattern')}: ${plan.urlPattern}`
		});
		this.contentEl.createEl('p', {
			text: t('migration.stats', {
				bytes: formatBytes(plan.stats.totalBytes),
				files: plan.stats.uniqueFiles,
				notes: plan.stats.noteCount,
				refs: plan.stats.totalRefs
			})
		});
	}

	private runAsync(task: Promise<unknown>): void {
		task.catch((error: unknown) => {
			this.error = error instanceof Error ? error.message : t('errors.imageActionFailed');
			this.render();
		});
	}

	private async scan(): Promise<void> {
		this.error = null;
		if (!this.backupConfirmed) {
			this.error = t('migration.backupConfirm');
			this.render();
			return;
		}
		const profile = this.params.getActiveProfile();
		const block = migrationProfileBlockReason(profile);
		if (!profile || block) {
			this.error = block ?? t('errors.noActiveStorageProfile');
			this.render();
			return;
		}
		const parsed = resolveMigrationFolders(this.folders);
		if (!parsed.ok) {
			this.error = parsed.message;
			this.render();
			return;
		}
		const existing = assertMigrationFoldersExist(parsed.folders, (path) => this.params.scanVault.folderExists(path));
		if (!existing.ok) {
			this.error = existing.message;
			this.render();
			return;
		}
		const plan = await scanMigrationPlan({
			deleteSourceAfterUpload: this.deleteSourceAfterUpload,
			folders: existing.folders,
			parse: (content) => this.params.parser.parse(content),
			profile,
			vault: this.params.scanVault
		});
		await this.params.store.save(plan);
		this.plan = plan;
		this.phase = 'scanned';
		if (plan.items.length === 0) {
			this.error = t('migration.noItems');
		}
		this.render();
	}
}

export function openMigrationModal(params: OpenMigrationModalParams): void {
	const modal = new MigrationModal(params);
	modal.open();
}
