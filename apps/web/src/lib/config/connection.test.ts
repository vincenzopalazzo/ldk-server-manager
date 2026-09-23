import { beforeEach, describe, expect, it } from 'vitest';
import { connection } from './connection.svelte';

const bundle = { url: 'http://umbrel.local:2150', apiKey: 'ab'.repeat(32) };
const own = { url: 'https://node.example', apiKey: 'cd'.repeat(32) };

describe('bundle probe', () => {
	beforeEach(() => connection.clear());

	it('connects a page that had no connection of its own', () => {
		connection.beginBundleProbe()(bundle);
		expect(connection.settings).toEqual(bundle);
		expect(connection.source).toBe('bundle');
	});

	it('never replaces a connection the operator saved', () => {
		connection.save(own);
		connection.beginBundleProbe()(bundle);
		expect(connection.settings).toEqual(own);
		expect(connection.source).toBe('saved');
	});

	it('does not undo a Disconnect made while the probe was in flight', () => {
		connection.save(own);
		const apply = connection.beginBundleProbe();
		connection.clear(); // the operator clicks Disconnect before /bundle.json answers
		apply(bundle);
		expect(connection.settings).toBeNull();
		expect(connection.source).toBeNull();
	});

	it('does not override a connection saved while the probe was in flight', () => {
		const apply = connection.beginBundleProbe();
		connection.save(own);
		apply(bundle);
		expect(connection.settings).toEqual(own);
	});
});
