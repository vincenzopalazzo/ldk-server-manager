import {
	create,
	ChannelConfigSchema,
	RouteParametersConfigSchema,
	type ChannelConfig
} from '@ldk-server-manager/client';
import { requireClient } from '$lib/api/client.svelte';
import { balances, channels, peers } from '$lib/state/node.svelte';
import { payments } from '$lib/state/payments.svelte';
import { parseSats } from '$lib/utils/format';

/**
 * Imperative operations against the node. Each action validates its input,
 * calls ldk-server, and refreshes the resources it affects. UI code should
 * call these instead of touching the client directly.
 */

function requireSats(input: string, label: string): bigint {
	const v = parseSats(input);
	if (v === null || v <= 0n) throw new Error(`${label} must be a positive whole number of sats`);
	return v;
}

function requireHex(input: string, label: string, length?: number): string {
	const v = input.trim().toLowerCase();
	if (!/^[0-9a-f]+$/.test(v) || (length !== undefined && v.length !== length)) {
		throw new Error(`${label} must be ${length ? `${length} ` : ''}hex characters`);
	}
	return v;
}

// --- Peers -----------------------------------------------------------------

export async function connectPeer(
	nodePubkey: string,
	address: string,
	persist = true
): Promise<void> {
	const pubkey = requireHex(nodePubkey, 'Node ID', 66);
	if (!address.trim()) throw new Error('Address is required');
	await requireClient().api.connectPeer({ nodePubkey: pubkey, address: address.trim(), persist });
	await peers.refresh();
}

/** Accepts `pubkey@host:port` and splits it. */
export function parsePeerUri(uri: string): { nodePubkey: string; address: string } {
	const [pubkey, address] = uri.trim().split('@');
	if (!pubkey || !address) throw new Error('Expected pubkey@host:port');
	return { nodePubkey: pubkey, address };
}

export async function disconnectPeer(nodePubkey: string): Promise<void> {
	await requireClient().api.disconnectPeer({ nodePubkey });
	await peers.refresh();
}

// --- Channels --------------------------------------------------------------

export interface OpenChannelInput {
	nodePubkey: string;
	address: string;
	amountSats: string;
	pushMsat?: string;
	announce: boolean;
	config?: Partial<ChannelConfig>;
}

export async function openChannel(input: OpenChannelInput): Promise<string> {
	const nodePubkey = requireHex(input.nodePubkey, 'Node ID', 66);
	if (!input.address.trim()) throw new Error('Address is required');
	const amount = requireSats(input.amountSats, 'Channel size');
	const push = input.pushMsat?.trim()
		? requireSats(input.pushMsat, 'Push amount') * 1000n
		: undefined;
	const res = await requireClient().api.openChannel({
		nodePubkey,
		address: input.address.trim(),
		amount: { case: 'channelAmountSats', value: amount },
		pushToCounterpartyMsat: push,
		announceChannel: input.announce,
		channelConfig: input.config ? create(ChannelConfigSchema, input.config) : undefined
	});
	await Promise.all([channels.refresh(), balances.refresh()]);
	return res.userChannelId;
}

export async function closeChannel(
	userChannelId: string,
	counterpartyNodeId: string,
	force = false,
	reason?: string
): Promise<void> {
	const api = requireClient().api;
	if (force)
		await api.forceCloseChannel({ userChannelId, counterpartyNodeId, forceCloseReason: reason });
	else await api.closeChannel({ userChannelId, counterpartyNodeId });
	await Promise.all([channels.refresh(), balances.refresh()]);
}

export async function updateChannelConfig(
	userChannelId: string,
	counterpartyNodeId: string,
	config: Partial<ChannelConfig>
): Promise<void> {
	await requireClient().api.updateChannelConfig({
		userChannelId,
		counterpartyNodeId,
		channelConfig: create(ChannelConfigSchema, config)
	});
	await channels.refresh();
}

export async function spliceIn(
	userChannelId: string,
	counterpartyNodeId: string,
	amountSats: string
): Promise<void> {
	const amount = requireSats(amountSats, 'Splice amount');
	await requireClient().api.spliceIn({
		userChannelId,
		counterpartyNodeId,
		amount: { case: 'spliceAmountSats', value: amount }
	});
	await Promise.all([channels.refresh(), balances.refresh()]);
}

export async function spliceOut(
	userChannelId: string,
	counterpartyNodeId: string,
	amountSats: string,
	address?: string
): Promise<string> {
	const amount = requireSats(amountSats, 'Splice amount');
	const res = await requireClient().api.spliceOut({
		userChannelId,
		counterpartyNodeId,
		spliceAmountSats: amount,
		address: address?.trim() || undefined
	});
	await Promise.all([channels.refresh(), balances.refresh()]);
	return res.address;
}

// --- On-chain --------------------------------------------------------------

export async function newOnchainAddress(): Promise<string> {
	return (await requireClient().api.onchainReceive()).address;
}

export async function sendOnchain(
	address: string,
	amountSats: string | 'all',
	feeRateSatPerVb?: string
): Promise<string> {
	if (!address.trim()) throw new Error('Address is required');
	const feeRate = feeRateSatPerVb?.trim() ? requireSats(feeRateSatPerVb, 'Fee rate') : undefined;
	const res = await requireClient().api.onchainSend({
		address: address.trim(),
		amount:
			amountSats === 'all'
				? { case: 'allFunds', value: {} }
				: { case: 'amountSats', value: requireSats(amountSats, 'Amount') },
		feeRateSatPerVb: feeRate
	});
	await Promise.all([balances.refresh(), payments.refresh()]);
	return res.txid;
}

// --- Receive ---------------------------------------------------------------

export interface CreateInvoiceInput {
	amountSats?: string;
	description: string;
	expirySecs: number;
	viaJitChannel?: boolean;
}

export async function createBolt11Invoice(
	input: CreateInvoiceInput
): Promise<{ invoice: string; paymentHash?: string }> {
	const api = requireClient().api;
	const description = { kind: { case: 'direct' as const, value: input.description } };
	const amountMsat = input.amountSats?.trim()
		? requireSats(input.amountSats, 'Amount') * 1000n
		: undefined;
	if (input.viaJitChannel) {
		if (amountMsat === undefined) {
			const res = await api.bolt11ReceiveVariableAmountViaJitChannel({
				description,
				expirySecs: input.expirySecs
			});
			return { invoice: res.invoice };
		}
		const res = await api.bolt11ReceiveViaJitChannel({
			amountMsat,
			description,
			expirySecs: input.expirySecs
		});
		return { invoice: res.invoice };
	}
	const res = await api.bolt11Receive({ amountMsat, description, expirySecs: input.expirySecs });
	return { invoice: res.invoice, paymentHash: res.paymentHash };
}

export async function createBolt12Offer(
	description: string,
	amountSats?: string,
	expirySecs?: number
): Promise<{ offer: string; offerId: string }> {
	const amountMsat = amountSats?.trim() ? requireSats(amountSats, 'Amount') * 1000n : undefined;
	const res = await requireClient().api.bolt12Receive({ description, amountMsat, expirySecs });
	return { offer: res.offer, offerId: res.offerId };
}

// --- Send ------------------------------------------------------------------

export interface SendInput {
	/** BOLT11 invoice, BOLT12 offer, BIP21 URI or BIP353 name. */
	destination: string;
	/** Optional amount for zero-amount invoices/offers. */
	amountSats?: string;
	maxFeeSats?: string;
}

/** Pay anything ldk-server's UnifiedSend understands. Returns a payment/tx id. */
export async function sendPayment(input: SendInput): Promise<{ kind: string; id: string }> {
	const uri = input.destination.trim();
	if (!uri) throw new Error('Destination is required');
	const amountMsat = input.amountSats?.trim()
		? requireSats(input.amountSats, 'Amount') * 1000n
		: undefined;
	const routeParameters = input.maxFeeSats?.trim()
		? create(RouteParametersConfigSchema, {
				maxTotalRoutingFeeMsat: requireSats(input.maxFeeSats, 'Max fee') * 1000n
			})
		: undefined;
	const res = await requireClient().api.unifiedSend({ uri, amountMsat, routeParameters });
	await Promise.all([balances.refresh(), payments.refresh()]);
	const r = res.paymentResult;
	return { kind: r.case ?? 'unknown', id: r.value ?? '' };
}

export async function sendKeysend(nodeId: string, amountSats: string): Promise<string> {
	const res = await requireClient().api.spontaneousSend({
		nodeId: requireHex(nodeId, 'Node ID', 66),
		amountMsat: requireSats(amountSats, 'Amount') * 1000n
	});
	await Promise.all([balances.refresh(), payments.refresh()]);
	return res.paymentId;
}

export async function decodeDestination(input: string) {
	const api = requireClient().api;
	const s = input.trim().toLowerCase();
	if (s.startsWith('lno'))
		return { type: 'bolt12' as const, offer: await api.decodeOffer({ offer: input.trim() }) };
	return { type: 'bolt11' as const, invoice: await api.decodeInvoice({ invoice: input.trim() }) };
}

// --- Misc ------------------------------------------------------------------

export async function signMessage(message: string): Promise<string> {
	return (await requireClient().api.signMessage({ message: new TextEncoder().encode(message) }))
		.signature;
}

export async function verifySignature(
	message: string,
	signature: string,
	publicKey: string
): Promise<boolean> {
	return (
		await requireClient().api.verifySignature({
			message: new TextEncoder().encode(message),
			signature,
			publicKey
		})
	).valid;
}
