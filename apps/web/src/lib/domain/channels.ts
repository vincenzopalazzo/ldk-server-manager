import type { Channel } from '@ldk-server-manager/client';
import { ChannelShutdownState } from '@ldk-server-manager/client';
import type { PillTone } from '@ldk-server-manager/ui';

export type ChannelStatus = 'Ready' | 'Pending' | 'Closing' | 'Offline';

/** Derive the human status shown in the design from raw channel flags. */
export function channelStatus(c: Channel): ChannelStatus {
	const shutdown = c.channelShutdownState;
	if (
		shutdown !== undefined &&
		shutdown !== ChannelShutdownState.UNSPECIFIED &&
		shutdown !== ChannelShutdownState.NOT_SHUTTING_DOWN
	) {
		return 'Closing';
	}
	if (!c.isChannelReady) return 'Pending';
	if (!c.isUsable) return 'Offline';
	return 'Ready';
}

export function statusTone(status: ChannelStatus): PillTone {
	return status === 'Ready' ? 'green' : status === 'Pending' ? 'amber' : 'red';
}

export const localSats = (c: Channel) => c.outboundCapacityMsat / 1000n;
export const remoteSats = (c: Channel) => c.inboundCapacityMsat / 1000n;

export function localPercent(c: Channel): number {
	const l = Number(localSats(c));
	const r = Number(remoteSats(c));
	return Math.round((100 * l) / (l + r || 1));
}
