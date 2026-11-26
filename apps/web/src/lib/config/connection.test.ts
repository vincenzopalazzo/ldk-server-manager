import { beforeEach, describe, expect, it } from 'vitest';
import { connection } from './connection.svelte';

const bundle = {
	url: 'http://umbrel.local:2150',
	macaroon:
		'0201000207746573742d6964000006203846eea2ed59d53650493222c2380a3540668ade20044e28f9cb1e0b5b4e4429'
};
const own = {
	url: 'https://node.example',
	macaroon:
		'0201000207746573742d69640002177065726d697373696f6e73203d206e6f64653a7265616400000620fcd6db26ff34eca91e70ec1822ebb0e5ebb0ba3968cdb6544b900d9142a57659'
};

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
