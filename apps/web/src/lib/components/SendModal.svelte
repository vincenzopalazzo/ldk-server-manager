<script lang="ts">
	import { PaymentStatus } from '@ldk-server-manager/client';
	import { Button, Field, InfoBox, Input, Modal, Spinner, TextArea } from '@ldk-server-manager/ui';
	import { requireClient } from '$lib/api/client.svelte';
	import { sendKeysend, sendPayment } from '$lib/actions/node';
	import { ui } from '$lib/state/ui.svelte';
	import { prefs } from '$lib/state/prefs.svelte';
	import { showToast } from '$lib/state/toast.svelte';
	import { describeError } from '$lib/state/resource.svelte';
	import { msatToSats, parseSats } from '$lib/utils/format';
	import { payments } from '$lib/state/payments.svelte';
	import { balances } from '$lib/state/node.svelte';

	type Mode = 'invoice' | 'offer' | 'bip21' | 'onchain' | 'keysend';
	interface Decoded {
		mode: Mode;
		type: string;
		amountSats: bigint | null;
		desc: string;
		fee: string;
	}

	let stage = $state<'idle' | 'decoded' | 'paying' | 'done'>('idle');
	let input = $state('');
	let amountInput = $state('');
	let decoded = $state<Decoded | null>(null);
	let doneAmount = $state('');

	const needsAmount = $derived(decoded !== null && decoded.amountSats === null);

	async function decode() {
		const v = input.trim();
		if (!v) return showToast('Paste something first');
		const lower = v.toLowerCase();
		const api = requireClient().api;
		try {
			if (lower.startsWith('lno1')) {
				const o = await api.decodeOffer({ offer: v });
				if (o.isExpired) showToast('Offer is expired');
				const amt =
					o.amount?.amount.case === 'bitcoinAmountMsats' ? msatToSats(o.amount.amount.value) : null;
				decoded = {
					mode: 'offer',
					type: 'BOLT12 offer',
					amountSats: amt,
					desc: o.description || 'Offer payment',
					fee: 'route-dependent'
				};
			} else if (/^ln(bc|tb|bcrt|tbs)/.test(lower)) {
				const i = await api.decodeInvoice({ invoice: v });
				if (i.isExpired) showToast('Invoice is expired');
				decoded = {
					mode: 'invoice',
					type: 'BOLT11 invoice',
					amountSats: i.amountMsat === undefined ? null : msatToSats(i.amountMsat),
					desc: i.description || (i.descriptionHash ? 'hashed description' : 'Decoded invoice'),
					fee: 'route-dependent'
				};
			} else if (lower.startsWith('bitcoin:')) {
				const u = new URL(v);
				const btc = u.searchParams.get('amount');
				const amt = btc ? BigInt(Math.round(Number(btc) * 1e8)) : null;
				decoded = {
					mode: 'bip21',
					type: 'BIP21 URI',
					amountSats: amt,
					desc: u.searchParams.get('label') || u.pathname,
					fee: 'route or fee-rate dependent'
				};
			} else if (/^0[23][0-9a-f]{64}$/i.test(v)) {
				decoded = {
					mode: 'keysend',
					type: 'Keysend (node id)',
					amountSats: null,
					desc: 'Spontaneous payment',
					fee: 'route-dependent'
				};
			} else if (/^(bc1|tb1|bcrt1|[13mn2])[a-z0-9]{20,}$/i.test(v)) {
				decoded = {
					mode: 'onchain',
					type: 'On-chain address',
					amountSats: null,
					desc: 'On-chain send',
					fee: 'node fee-rate estimate'
				};
			} else {
				return showToast('Unrecognized destination');
			}
			amountInput = '';
			stage = 'decoded';
		} catch (e) {
			showToast(describeError(e));
		}
	}

	async function confirm() {
		if (!decoded) return;
		let amount = decoded.amountSats;
		if (amount === null) {
			const parsed = parseSats(amountInput);
			if (!parsed || parsed <= 0n) return showToast('Enter an amount in sats');
			amount = parsed;
		}
		stage = 'paying';
		try {
			const dest = input.trim();
			let paymentId: string | null = null;
			if (decoded.mode === 'keysend') {
				paymentId = await sendKeysend(dest, amount.toString());
			} else {
				const r = await sendPayment({
					destination: dest,
					amountSats: decoded.amountSats === null ? amount.toString() : undefined
				});
				if (r.kind !== 'txid') paymentId = r.id;
			}
			if (paymentId) await waitForPayment(paymentId);
			doneAmount = `−${prefs.withUnit(amount)}`;
			stage = 'done';
			void payments.refresh();
			void balances.refresh();
		} catch (e) {
			showToast(describeError(e));
			stage = 'decoded';
		}
	}

	/** Poll the payment until it leaves PENDING (up to ~30s). Throws on failure. */
	async function waitForPayment(paymentId: string) {
		const api = requireClient().api;
		for (let i = 0; i < 30; i++) {
			await new Promise((r) => setTimeout(r, 1000));
			const res = await api.getPaymentDetails({ paymentId });
			const st = res.payment?.status;
			if (st === PaymentStatus.SUCCEEDED) return;
			if (st === PaymentStatus.FAILED) throw new Error('Payment failed');
		}
		showToast('Payment still pending — check the payments list');
	}

	const rows = $derived(
		decoded
			? [
					{ k: 'Type', v: decoded.type, strong: true },
					{
						k: 'Amount',
						v: decoded.amountSats === null ? 'any amount' : prefs.withUnit(decoded.amountSats),
						mono: true,
						strong: true
					},
					{ k: 'Description', v: decoded.desc },
					{ k: 'Est. fee', v: decoded.fee, mono: true }
				]
			: []
	);
</script>

<Modal title="Send" onclose={() => ui.close()}>
	{#if stage === 'idle'}
		<div class="hint">
			Paste anything — BOLT11 invoice, BOLT12 offer, on-chain address, BIP21 URI, or a node ID for
			keysend. Unified send figures it out.
		</div>
		<div class="gap12">
			<TextArea bind:value={input} rows={4} placeholder="lnbc1… / lno1… / bc1q… / bitcoin:…" />
		</div>
		<div class="gap12"><Button variant="dark" block onclick={decode}>Decode</Button></div>
	{:else if stage === 'decoded' && decoded}
		<div class="gap14"><InfoBox {rows} /></div>
		{#if needsAmount}
			<div class="gap12">
				<Field label="Amount (sats)"
					><Input bind:value={amountInput} mono placeholder="amount in sats" /></Field
				>
			</div>
		{/if}
		<div class="gap12"><Button block onclick={confirm}>Confirm &amp; pay</Button></div>
	{:else if stage === 'paying'}
		<div class="center pad30">
			<Spinner />
			<span class="muted13">Finding route &amp; paying…</span>
		</div>
	{:else if stage === 'done'}
		<div class="center pad26">
			<span class="check">✓</span>
			<span class="doneTitle">Payment sent</span>
			<span class="doneAmt">{doneAmount}</span>
			<div class="gap6">
				<Button variant="soft" size="lg" onclick={() => ui.close()}>Done</Button>
			</div>
		</div>
	{/if}
</Modal>

<style>
	.hint {
		font-size: 12.5px;
		color: var(--muted);
		margin-top: 6px;
	}
	.gap12 {
		margin-top: 12px;
	}
	.gap14 {
		margin-top: 14px;
	}
	.gap6 {
		margin-top: 6px;
	}
	.center {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
	}
	.pad30 {
		padding: 30px 0;
	}
	.pad26 {
		padding: 26px 0;
		gap: 10px;
	}
	.muted13 {
		font-size: 13px;
		color: var(--muted);
	}
	.check {
		width: 44px;
		height: 44px;
		border-radius: 50%;
		background: var(--greenbg);
		color: var(--green);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-size: 20px;
		font-weight: 700;
	}
	.doneTitle {
		font-weight: 700;
		font-size: 16px;
	}
	.doneAmt {
		font-family: var(--font-mono);
		font-size: 13px;
		color: var(--muted);
	}
</style>
