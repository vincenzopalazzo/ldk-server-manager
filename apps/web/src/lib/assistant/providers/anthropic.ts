import Anthropic from '@anthropic-ai/sdk';
import { ProviderAuthError, type Provider, type ToolCall, type TurnResult } from './types';

/**
 * Anthropic provider, talking to the Messages API straight from the browser.
 * The key is supplied by the operator and stays in this browser.
 */
const MODELS = ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5'] as const;

export const anthropicProvider: Provider = {
	id: 'anthropic',
	label: 'Claude (Anthropic)',
	defaultModel: 'claude-opus-5',
	models: MODELS,
	credentialHint: 'An Anthropic API key (sk-ant-…) from console.anthropic.com.',

	async send(turn, { token, model }): Promise<TurnResult> {
		const client = new Anthropic({ apiKey: token, dangerouslyAllowBrowser: true });

		const messages: Anthropic.MessageParam[] = turn.history.map((m) => ({
			role: m.role === 'ai' ? 'assistant' : 'user',
			content: m.text
		}));

		if (turn.resolved.length > 0) {
			messages.push({
				role: 'assistant',
				content: turn.resolved.map(({ call }) => ({
					type: 'tool_use' as const,
					id: call.id,
					name: call.name,
					input: call.input
				}))
			});
			messages.push({
				role: 'user',
				content: turn.resolved.map(({ call, result }) => ({
					type: 'tool_result' as const,
					tool_use_id: call.id,
					content: result.output
				}))
			});
		}

		let response: Anthropic.Message;
		try {
			response = await client.messages.create({
				model,
				max_tokens: 1024,
				system: turn.system,
				output_config: { effort: 'medium' },
				tools: turn.tools.map((t) => ({
					name: t.name,
					description: t.description,
					input_schema: t.parameters as Anthropic.Tool.InputSchema
				})),
				messages
			});
		} catch (e) {
			if (
				e instanceof Anthropic.AuthenticationError ||
				e instanceof Anthropic.PermissionDeniedError
			) {
				throw new ProviderAuthError('Anthropic rejected the API key.');
			}
			throw e;
		}

		if (response.stop_reason === 'refusal') {
			return { text: 'I can’t help with that request.', calls: [], refused: true };
		}

		const calls: ToolCall[] = response.content
			.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
			.map((b) => ({ id: b.id, name: b.name, input: b.input as Record<string, unknown> }));

		const text = response.content
			.filter((b): b is Anthropic.TextBlock => b.type === 'text')
			.map((b) => b.text)
			.join('\n')
			.trim();

		return { text, calls };
	}
};
