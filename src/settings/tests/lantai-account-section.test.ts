import type { App } from 'obsidian';

import { fromPartial } from '@total-typescript/shoehorn';
import {
	DropdownComponent,
	SecretComponent,
	SliderComponent
} from 'obsidian';
import {
	afterEach,
	describe,
	expect,
	it,
	vi
} from 'vitest';

import type {
	LanTaiAccountClient,
	LanTaiAccountSummary,
	LanTaiImageSettings
} from '../../lantai/lantai-account.ts';
import type { LanTaiAccountSectionContext } from '../sections/lantai/lantai-account-section.ts';

import { displayLanTaiAccountSection } from '../sections/lantai/lantai-account-section.ts';

const SECRET_NAME = 'lantai-api-key';

describe('displayLanTaiAccountSection', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('binds the SecretComponent to the saved secret name', () => {
		const setValueSpy = vi.spyOn(SecretComponent.prototype, 'setValue');

		displayLanTaiAccountSection(document.body.createDiv(), createContext());

		expect(setValueSpy.mock.calls[0]?.[0]).toBe(SECRET_NAME);
	});

	it('stores the selected secret name and refreshes the card', () => {
		const selectedNames: string[] = [];
		let refreshCount = 0;
		const onChangeSpy = vi.spyOn(SecretComponent.prototype, 'onChange');

		displayLanTaiAccountSection(
			document.body.createDiv(),
			createContext({
				redisplay(): void {
					refreshCount += 1;
				},
				setApiKeySecretName(name: string): void {
					selectedNames.push(name);
				}
			})
		);

		const handler = onChangeSpy.mock.calls[0]?.[0];
		handler?.('my-lantai');

		expect(selectedNames).toEqual(['my-lantai']);
		expect(refreshCount).toBe(1);
	});

	it('ignores an empty selection so an existing link is not cleared', () => {
		const selectedNames: string[] = [];
		let refreshCount = 0;
		const onChangeSpy = vi.spyOn(SecretComponent.prototype, 'onChange');

		displayLanTaiAccountSection(
			document.body.createDiv(),
			createContext({
				redisplay(): void {
					refreshCount += 1;
				},
				setApiKeySecretName(name: string): void {
					selectedNames.push(name);
				}
			})
		);

		const handler = onChangeSpy.mock.calls[0]?.[0];
		handler?.('');
		handler?.(null);

		expect(selectedNames).toEqual([]);
		expect(refreshCount).toBe(0);
	});

	it('saves the latest format together with the latest quality', async () => {
		const saves: LanTaiImageSettings[] = [];
		const onDropdownChangeSpy = vi.spyOn(DropdownComponent.prototype, 'onChange');
		const onSliderLimitsSpy = vi.spyOn(SliderComponent.prototype, 'setLimits');
		const host = document.body.createDiv();

		displayLanTaiAccountSection(
			host,
			createContext({
				client: createFakeClient(saves),
				getApiKey(): null | string {
					return 'lt_test';
				}
			})
		);
		await flushAsync();

		const formatHandler = onDropdownChangeSpy.mock.calls[0]?.[0];
		formatHandler?.('png');
		await flushAsync();

		const slider = onSliderLimitsSpy.mock.contexts[0] as SliderComponent;
		slider.setValue(42);
		host.querySelector('input[type=range]')?.dispatchEvent(new Event('change'));
		await flushAsync();

		expect(saves).toEqual([
			{ format: 'png', quality: 80 },
			{ format: 'png', quality: 42 }
		]);
	});
});

function createContext(
	overrides: Partial<LanTaiAccountSectionContext> = {}
): LanTaiAccountSectionContext {
	return {
		app: Object.create(null) as App,
		client: Object.create(null) as LanTaiAccountClient,
		getApiKey(): null | string {
			return null;
		},
		getApiKeySecretName(): string {
			return SECRET_NAME;
		},
		openUrl(_url: string): void {
			return undefined;
		},
		redisplay(): void {
			return undefined;
		},
		setApiKeySecretName(_name: string): void {
			return undefined;
		},
		...overrides
	};
}

function createFakeClient(saves: LanTaiImageSettings[]): LanTaiAccountClient {
	return fromPartial<LanTaiAccountClient>({
		fetch: (): Promise<LanTaiAccountSummary> => Promise.resolve(createSummary()),
		saveImageSettings: (
			_baseUrl: string,
			_apiKey: string,
			settings: LanTaiImageSettings
		): Promise<LanTaiAccountSummary> => {
			saves.push(settings);
			return Promise.resolve(createSummary(settings));
		}
	});
}

function createSummary(
	settings: LanTaiImageSettings = { format: 'webp', quality: 80 }
): LanTaiAccountSummary {
	return {
		email: 'user@example.com',
		imageProcessingSettings: settings,
		plan: 'free',
		planExpiresAt: null,
		quotaBytes: 1024,
		trafficQuotaBytes: 0,
		trafficUsedBytes: 0,
		usedBytes: 0
	};
}

async function flushAsync(): Promise<void> {
	await new Promise<void>((resolve) => {
		window.setTimeout(resolve, 0);
	});
}
