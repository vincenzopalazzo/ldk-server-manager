import { describe, expect, it } from 'vitest';
import { TOOLS, describeCall, needsConfirmation, toolByName } from './tools';

describe('assistant tools', () => {
	it('gates exactly the fund-moving tools behind approval', () => {
		expect(needsConfirmation('send_payment')).toBe(true);
		expect(needsConfirmation('open_channel')).toBe(true);
		expect(needsConfirmation('create_invoice')).toBe(false);
		expect(needsConfirmation('nonexistent')).toBe(false);
	});

	it('summarizes a payment for the approval prompt', () => {
		expect(describeCall('send_payment', { destination: 'lno1abc', amount_sats: 21000 })).toContain(
			'21,000 sats'
		);
		expect(describeCall('send_payment', { destination: 'lnbc1abc' })).toContain('invoiced amount');
	});

	it('keeps every schema valid for both providers', () => {
		for (const t of TOOLS) {
			expect(t.parameters.type).toBe('object');
			expect(t.parameters.additionalProperties).toBe(false);
			// Required names must exist as properties, or providers reject the schema.
			for (const r of t.parameters.required ?? [])
				expect(t.parameters.properties).toHaveProperty(r);
			expect(toolByName(t.name)).toBe(t);
		}
	});
});
