import type { Payment } from '@ldk-server-manager/client';
import { PaymentDirection, PaymentStatus } from '@ldk-server-manager/client';
import type { PillTone } from '@ldk-server-manager/ui';
import { truncateId } from '$lib/utils/format';

export type PayFilter = 'All' | 'Sent' | 'Received' | 'Failed';

export function paymentKind(p: Payment): string {
	switch (p.kind?.kind.case) {
		case 'onchain':
			return 'onchain';
		case 'bolt11':
			return 'bolt11';
		case 'bolt12Offer':
			return 'bolt12';
		case 'bolt12Refund':
			return 'refund';
		case 'spontaneous':
			return 'spontaneous';
		default:
			return 'unknown';
	}
}

/** One-line description built from what the node stores about the payment. */
export function paymentDescription(p: Payment): string {
	const k = p.kind?.kind;
	switch (k?.case) {
		case 'onchain': {
			const t = k.value.txType?.kind.case;
			const label =
				t === 'funding'
					? 'Channel funding'
					: t === 'cooperativeClose'
						? 'Cooperative close'
						: t === 'unilateralClose'
							? 'Unilateral close'
							: t === 'anchorBump'
								? 'Anchor bump'
								: t === 'claim'
									? 'Claim'
									: t === 'sweep'
										? 'Sweep'
										: t === 'interactiveFunding'
											? 'Splice'
											: 'On-chain';
			const conf = k.value.status?.status.case === 'confirmed' ? 'confirmed' : 'unconfirmed';
			return `${label} · ${conf}`;
		}
		case 'bolt11':
			return p.direction === PaymentDirection.INBOUND ? 'Invoice received' : 'Invoice paid';
		case 'bolt12Offer':
			return k.value.payerNote ? `Offer · ${k.value.payerNote}` : 'Offer payment';
		case 'bolt12Refund':
			return k.value.payerNote ? `Refund · ${k.value.payerNote}` : 'Refund';
		case 'spontaneous':
			return p.direction === PaymentDirection.INBOUND ? 'Keysend received' : 'Keysend';
		default:
			return 'Payment';
	}
}

export function paymentStatusLabel(p: Payment): 'Succeeded' | 'Failed' | 'Pending' {
	return p.status === PaymentStatus.SUCCEEDED
		? 'Succeeded'
		: p.status === PaymentStatus.FAILED
			? 'Failed'
			: 'Pending';
}

export function paymentTone(p: Payment): PillTone {
	return p.status === PaymentStatus.SUCCEEDED
		? 'green'
		: p.status === PaymentStatus.FAILED
			? 'red'
			: 'amber';
}

export function isOutbound(p: Payment): boolean {
	return p.direction === PaymentDirection.OUTBOUND;
}

export function matchesFilter(p: Payment, f: PayFilter): boolean {
	if (f === 'All') return true;
	if (f === 'Sent') return isOutbound(p);
	if (f === 'Received') return !isOutbound(p);
	return p.status === PaymentStatus.FAILED;
}

export function paymentShortId(p: Payment): string {
	return truncateId(p.paymentId, 12, 6);
}
