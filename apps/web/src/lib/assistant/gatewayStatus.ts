import type { PillTone } from '@ldk-server-manager/ui';
import type { GatewayCheck } from './gateway';

/**
 * How a gateway check is presented. Shared by the Settings card and the assistant drawer so
 * the two can never disagree about what a state means or what to do about it.
 */
export interface GatewayView {
	/** Short label for a pill: "online", "unreachable". */
	text: string;
	tone: PillTone;
	/** Dot colour, as a design token. */
	dot: string;
	/** One-line heading for a warning, or null when all is well. */
	title: string | null;
	/** What the operator should do, or null when nothing. */
	hint: string | null;
}

export function describeGateway(check: GatewayCheck | undefined): GatewayView {
	if (!check) {
		return {
			text: 'checking…',
			tone: 'muted',
			dot: 'var(--nav-inactive)',
			title: null,
			hint: null
		};
	}
	switch (check.state) {
		case 'online':
			return { text: 'online', tone: 'green', dot: 'var(--live)', title: null, hint: null };
		case 'no-credential':
			return {
				text: 'no credential',
				tone: 'amber',
				dot: 'var(--acc)',
				title: 'goose is not signed in',
				hint: 'The gateway is running but goose has no usable credential. On the host, run `goose configure` and choose xai_oauth.'
			};
		case 'unreachable':
			return {
				text: 'unreachable',
				tone: 'red',
				dot: 'var(--live-red)',
				title: 'Gateway unreachable',
				hint: `Nothing answered at ${check.url}. Start it from the repository root with \`docker compose up -d\`, or fix the address in Setup.`
			};
		case 'error':
			return {
				text: 'error',
				tone: 'red',
				dot: 'var(--live-red)',
				title: 'Gateway error',
				hint: `The gateway answered unexpectedly (${check.detail ?? 'unknown'}).`
			};
	}
}
