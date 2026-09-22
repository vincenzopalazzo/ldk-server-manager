import { describe, expect, it } from 'vitest';
import type { GatewayCheck, GatewayState } from './gateway';
import { describeGateway } from './gatewayStatus';

const check = (state: GatewayState, detail: string | null = null): GatewayCheck => ({
	state,
	provider: 'xai_oauth',
	latencyMs: 3,
	detail,
	url: 'http://127.0.0.1:8791/health',
	checkedAt: 0
});

describe('describeGateway', () => {
	it('shows a neutral state before the first check finishes', () => {
		const v = describeGateway(undefined);
		expect(v.text).toBe('checking…');
		expect(v.title).toBeNull();
	});

	it('has nothing to say when the gateway is online', () => {
		const v = describeGateway(check('online'));
		expect(v.tone).toBe('green');
		expect(v.title).toBeNull();
		expect(v.hint).toBeNull();
	});

	it('points at goose configure when nobody is signed in', () => {
		const v = describeGateway(check('no-credential'));
		expect(v.tone).toBe('amber');
		expect(v.hint).toContain('goose configure');
	});

	it('names the probed address and the compose command when unreachable', () => {
		const v = describeGateway(check('unreachable'));
		expect(v.tone).toBe('red');
		expect(v.hint).toContain('http://127.0.0.1:8791/health');
		expect(v.hint).toContain('docker compose up -d');
	});

	it('passes through the error detail', () => {
		expect(describeGateway(check('error', 'HTTP 500')).hint).toContain('HTTP 500');
	});
});
