import { balances, channels, nodeInfo, peers } from '$lib/state/node.svelte';
import { payments } from '$lib/state/payments.svelte';
import { channelStatus, localSats, remoteSats } from '$lib/domain/channels';
import {
	isOutbound,
	paymentDescription,
	paymentKind,
	paymentStatusLabel
} from '$lib/domain/payments';
import { aliases } from '$lib/state/aliases.svelte';
import { msatToSats } from '$lib/utils/format';

/**
 * Read-only picture of the node handed to the model on every turn.
 *
 * Deliberately small: enough to answer questions about liquidity and recent
 * activity without shipping the full channel list on a large node.
 */
export function nodeSnapshot() {
	const info = nodeInfo.data;
	const bal = balances.data;
	const chs = channels.data ?? [];
	const ln = bal?.totalLightningBalanceSats ?? 0n;
	const oc = bal?.totalOnchainBalanceSats ?? 0n;
	return {
		alias: info?.nodeAlias ?? null,
		node_id: info?.nodeId ?? null,
		block_height: info?.currentBestBlock?.height ?? null,
		balances_sats: { lightning: Number(ln), onchain: Number(oc), total: Number(ln + oc) },
		channels: chs.map((c) => ({
			peer: aliases.get(c.counterpartyNodeId),
			peer_node_id: c.counterpartyNodeId,
			user_channel_id: c.userChannelId,
			capacity_sats: Number(c.channelValueSats),
			local_sats: Number(localSats(c)),
			remote_sats: Number(remoteSats(c)),
			status: channelStatus(c)
		})),
		peers_connected: (peers.data ?? []).filter((p) => p.isConnected).length,
		recent_payments: payments.items.slice(0, 6).map((p) => ({
			dir: isOutbound(p) ? 'out' : 'in',
			kind: paymentKind(p),
			amount_sats: Number(msatToSats(p.amountMsat)),
			status: paymentStatusLabel(p),
			desc: paymentDescription(p)
		}))
	};
}

export const SYSTEM_PROMPT =
	'You are the operations assistant embedded in an LDK Server (Lightning Network node) dashboard, ' +
	'in the spirit of a Square/Block terminal assistant. You help the operator analyze the node and run ' +
	'operations. Be concise (2-6 short lines), plain language, amounts in sats with thousands separators. ' +
	'Use the tools to act when the user asks for an operation; confirm what you did. ' +
	'Anything that moves funds is shown to the operator for approval before it runs, so state plainly ' +
	'what you are about to do rather than promising it is already done.';

/** System prompt with the live node state appended. */
export function systemPrompt(): string {
	return `${SYSTEM_PROMPT} Current node snapshot: ${JSON.stringify(nodeSnapshot())}`;
}
