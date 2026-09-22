export type ModalKind = 'send' | 'receive' | 'channel' | null;

/** Cross-page UI state: which modal is open, assistant drawer, selected channel. */
class UiState {
	modal = $state<ModalKind>(null);
	assistantOpen = $state(false);
	/** The assistant's provider selection panel. */
	providerPanelOpen = $state(false);
	selectedChannelId = $state<string | null>(null);

	open(kind: ModalKind) {
		this.modal = kind;
	}
	close() {
		this.modal = null;
	}
	toggleAssistant() {
		this.assistantOpen = !this.assistantOpen;
	}
}

export const ui = new UiState();
