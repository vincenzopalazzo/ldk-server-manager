import { browser } from '$app/environment';

export type Unit = 'sats' | 'btc';

const KEY = 'ldk-server-manager:prefs';

function load(): { unit: Unit; dark: boolean } {
	if (!browser) return { unit: 'sats', dark: false };
	try {
		const raw = localStorage.getItem(KEY);
		if (raw) {
			const p = JSON.parse(raw);
			return { unit: p.unit === 'btc' ? 'btc' : 'sats', dark: !!p.dark };
		}
	} catch {
		/* ignore */
	}
	return { unit: 'sats', dark: false };
}

/** Display preferences: amount unit and theme. Persisted per browser. */
class Prefs {
	unit = $state<Unit>('sats');
	dark = $state(false);

	constructor() {
		const p = load();
		this.unit = p.unit;
		this.dark = p.dark;
		this.applyTheme();
	}

	toggleUnit() {
		this.unit = this.unit === 'sats' ? 'btc' : 'sats';
		this.persist();
	}

	toggleTheme() {
		this.dark = !this.dark;
		this.applyTheme();
		this.persist();
	}

	/** Format an amount in sats according to the active unit, exactly as the design does. */
	fmt(sats: bigint | number | undefined | null): string {
		const n = Number(sats ?? 0);
		if (this.unit === 'sats') return n.toLocaleString('en-US');
		return '₿ ' + (n / 1e8).toFixed(8).replace(/(\d{2})(\d{3})(\d{3})$/, '$1 $2 $3');
	}

	get unitLabel(): string {
		return this.unit === 'sats' ? 'sats' : '₿ BTC';
	}

	get unitSuffix(): string {
		return this.unit === 'sats' ? 'sats' : '';
	}

	/** "1,234 sats" or "₿ 0.00 001 234" (no suffix in BTC mode, like the design). */
	withUnit(sats: bigint | number | undefined | null): string {
		return this.unit === 'sats' ? `${this.fmt(sats)} sats` : this.fmt(sats);
	}

	private applyTheme() {
		if (browser) document.body.classList.toggle('dark', this.dark);
	}

	private persist() {
		if (!browser) return;
		try {
			localStorage.setItem(KEY, JSON.stringify({ unit: this.unit, dark: this.dark }));
		} catch {
			/* ignore */
		}
	}
}

export const prefs = new Prefs();
