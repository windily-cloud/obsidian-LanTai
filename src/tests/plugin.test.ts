import type { PluginManifest } from 'obsidian';

import { Component } from 'obsidian';
import { App } from 'obsidian-test-mocks/obsidian';
import {
	beforeEach,
	describe,
	expect,
	it,
	vi
} from 'vitest';

/*
 * The real `PluginBase` (from `obsidian-dev-utils`) drives the lifecycle here —
 * it is NOT mocked. `await plugin.onload()` registers the base's universal
 * components, runs the plugin's `onloadImpl`, then loads every queued child via
 * the real children-first lifecycle.
 */

vi.mock('obsidian-dev-utils/obsidian/command-handlers/command-handler-component', () => ({
	// eslint-disable-next-line prefer-arrow-callback, func-names -- mock must be constructable with `new` and return a loadable Component exposing registerCommandHandlers.
	CommandHandlerComponent: vi.fn(function (): Component {
		return Object.assign(new Component(), { registerCommandHandlers: vi.fn() });
	})
}));

vi.mock('obsidian-dev-utils/obsidian/components/menu-event-registrar-component', () => ({
	// eslint-disable-next-line prefer-arrow-callback, func-names -- mock must be constructable with `new` and return a loadable Component.
	MenuEventRegistrarComponent: vi.fn(function (): Component {
		return new Component();
	})
}));

vi.mock('obsidian-dev-utils/obsidian/active-file-provider', () => ({
	AppActiveFileProvider: vi.fn()
}));

// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { Plugin } from '../plugin.ts';

describe('Plugin', () => {
	let app: App;
	let manifest: PluginManifest;

	beforeEach(() => {
		vi.clearAllMocks();
		app = App.createConfigured__();
		const appOriginal = app.asOriginalType__();

		appOriginal.workspace.onLayoutReady = vi.fn((callback: () => void) => {
			callback();
		});

		manifest = {
			author: 'windily-cloud',
			description: 'test',
			id: 'lantai',
			minAppVersion: '1.11.4',
			name: 'LanTai',
			version: '0.1.0'
		};
	});

	it('should load without sample components', async () => {
		const plugin = new Plugin(app.asOriginalType__(), manifest);
		await plugin.onload();

		expect(plugin).toBeInstanceOf(Plugin);
	});
});
