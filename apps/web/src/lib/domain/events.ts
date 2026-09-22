import type { EventEnvelope } from '@ldk-server-manager/client';
import { ChannelState } from '@ldk-server-manager/client';
import { msatToSats } from '$lib/utils/format';

export interface EventView {
	kind: string;
	detail: string;
	dot: string;
}

const GREEN = '#3DD68C';
const YELLOW = '#FFD200';
const RED = '#F0564A';

const sats = (msat: bigint | undefined) => msatToSats(msat).toLocaleString('en-US');

/** Turn a raw event envelope into the kind / detail / dot triple the dashboard renders. */
export function describeEvent(env: EventEnvelope, alias: (id?: string) => string): EventView {
	const e = env.event;
	switch (e.case) {
		case 'paymentReceived':
			return {
				kind: 'PaymentReceived',
				detail: `+${sats(e.value.payment?.amountMsat)} sats`,
				dot: GREEN
			};
		case 'paymentSuccessful':
			return {
				kind: 'PaymentSuccessful',
				detail: `−${sats(e.value.payment?.amountMsat)} sats`,
				dot: GREEN
			};
		case 'paymentFailed':
			return {
				kind: 'PaymentFailed',
				detail: `${sats(e.value.payment?.amountMsat)} sats · ${reason(e.value.reason)}`,
				dot: RED
			};
		case 'paymentClaimable':
			return {
				kind: 'PaymentClaimable',
				detail: `hodl ${sats(e.value.claimableAmountMsat)} sats awaiting claim`,
				dot: YELLOW
			};
		case 'paymentForwarded':
			return {
				kind: 'PaymentForwarded',
				detail: `fee earned ${sats(e.value.totalFeeEarnedMsat)} sats`,
				dot: YELLOW
			};
		case 'channelStateChanged': {
			const st = e.value.state;
			const name =
				st === ChannelState.READY
					? 'ready'
					: st === ChannelState.PENDING
						? 'pending'
						: st === ChannelState.CLOSED
							? 'closed'
							: st === ChannelState.OPEN_FAILED
								? 'open failed'
								: 'changed';
			const bad = st === ChannelState.CLOSED || st === ChannelState.OPEN_FAILED;
			return {
				kind: 'ChannelStateChanged',
				detail: `${alias(e.value.counterpartyNodeId)} → ${name}`,
				dot: bad ? RED : YELLOW
			};
		}
		case 'spliceNegotiated':
			return {
				kind: 'SpliceNegotiated',
				detail: `${alias(e.value.counterpartyNodeId)} · funding pending`,
				dot: YELLOW
			};
		case 'spliceNegotiationFailed':
			return {
				kind: 'SpliceNegotiationFailed',
				detail: alias(e.value.counterpartyNodeId),
				dot: RED
			};
		default:
			return { kind: 'Event', detail: '', dot: YELLOW };
	}
}

function reason(r: number | undefined): string {
	switch (r) {
		case 1:
			return 'recipient rejected';
		case 2:
			return 'abandoned';
		case 3:
			return 'retries exhausted';
		case 4:
			return 'expired';
		case 5:
			return 'no route';
		case 7:
			return 'unknown required features';
		case 8:
			return 'invoice request expired';
		case 9:
			return 'invoice request rejected';
		case 10:
			return 'blinded path failed';
		default:
			return 'failed';
	}
}
