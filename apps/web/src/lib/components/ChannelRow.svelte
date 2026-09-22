<script lang="ts">
	import type { Channel } from '@ldk-server-manager/client';
	import { Bar, Ellipsis, ListRow, Pill } from '@ldk-server-manager/ui';
	import {
		channelStatus,
		localPercent,
		localSats,
		remoteSats,
		statusTone
	} from '$lib/domain/channels';
	import { aliases } from '$lib/state/aliases.svelte';
	import { prefs } from '$lib/state/prefs.svelte';
	import { formatScid } from '$lib/utils/scid';

	interface Props {
		channel: Channel;
		/** Full variant (channels page): capacity + local/remote labels + selection. */
		full?: boolean;
		selected?: boolean;
		onclick: () => void;
	}
	let { channel, full = false, selected = false, onclick }: Props = $props();
	const status = $derived(channelStatus(channel));
</script>

<ListRow
	columns="minmax(0,1.3fr) minmax(0,1.6fr) auto"
	gap={16}
	padding="13px 20px"
	clickable
	{selected}
	{onclick}
>
	<div class="who">
		<Ellipsis strong size={13.5}>{aliases.get(channel.counterpartyNodeId)}</Ellipsis>
		<div class="scid">
			{formatScid(channel.shortChannelId)}{full
				? ` · cap ${prefs.fmt(channel.channelValueSats)}`
				: ''}
		</div>
	</div>
	<div>
		<Bar percent={localPercent(channel)} />
		<div class="amts">
			<span
				>{prefs.fmt(localSats(channel))}{#if full}&nbsp;local{/if}</span
			>
			<span
				>{prefs.fmt(remoteSats(channel))}{#if full}&nbsp;remote{/if}</span
			>
		</div>
	</div>
	<Pill tone={statusTone(status)}>{status}</Pill>
</ListRow>

<style>
	.who {
		min-width: 0;
	}
	.scid {
		font-family: var(--font-mono);
		font-size: 10.5px;
		color: var(--muted);
	}
	.amts {
		display: flex;
		justify-content: space-between;
		font-family: var(--font-mono);
		font-size: 10.5px;
		color: var(--muted);
		margin-top: 5px;
	}
</style>
