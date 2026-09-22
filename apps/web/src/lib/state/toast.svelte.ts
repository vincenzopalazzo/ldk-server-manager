class ToastStore {
	message = $state<string | null>(null);
	private timer: ReturnType<typeof setTimeout> | null = null;

	show(text: string, ms = 2200) {
		if (this.timer) clearTimeout(this.timer);
		this.message = text;
		this.timer = setTimeout(() => (this.message = null), ms);
	}
}

export const toast = new ToastStore();
export const showToast = (t: string) => toast.show(t);
