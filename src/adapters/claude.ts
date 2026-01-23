import {
    BaseModelAdapter,
    ModelConfig,
    ChatMessage,
    ModelResponse,
    StreamChunk,
    ModelAdapterFactory
} from './base';

/**
 * Claude (Anthropic) Model Adapter
 */
export class ClaudeAdapter extends BaseModelAdapter {
    private readonly DEFAULT_MODEL = 'claude-3-5-sonnet-20241022';
    private readonly MAX_TOKENS = 200000;
    private readonly CHARS_PER_TOKEN = 4;

    constructor(config: ModelConfig) {
        super('claude', config);
    }

    async sendMessage(messages: ChatMessage[]): Promise<ModelResponse> {
        const { system, chat } = this.separateSystemMessage(messages);

        const response = await fetch(this.config.baseUrl || 'https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.config.apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: this.config.model || this.DEFAULT_MODEL,
                max_tokens: this.config.maxTokens || 4096,
                system: system,
                messages: chat.map(m => ({
                    role: m.role,
                    content: m.content
                }))
            })
        });

        if (!response.ok) {
            throw new Error(`Claude API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json() as any;

        return {
            content: data.content[0].text,
            model: data.model,
            usage: {
                promptTokens: data.usage.input_tokens,
                completionTokens: data.usage.output_tokens,
                totalTokens: data.usage.input_tokens + data.usage.output_tokens
            }
        };
    }

    async streamMessage(
        messages: ChatMessage[],
        onChunk: (chunk: StreamChunk) => void
    ): Promise<ModelResponse> {
        const { system, chat } = this.separateSystemMessage(messages);

        const response = await fetch(this.config.baseUrl || 'https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.config.apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: this.config.model || this.DEFAULT_MODEL,
                max_tokens: this.config.maxTokens || 4096,
                stream: true,
                system: system,
                messages: chat.map(m => ({
                    role: m.role,
                    content: m.content
                }))
            })
        });

        if (!response.ok || !response.body) {
            throw new Error(`Claude API error: ${response.status}`);
        }

        let fullContent = '';
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n').filter(line => line.startsWith('data: '));

            for (const line of lines) {
                const data = JSON.parse(line.slice(6)) as any;
                if (data.type === 'content_block_delta') {
                    const text = data.delta.text;
                    fullContent += text;
                    onChunk({ content: text, done: false });
                }
            }
        }

        onChunk({ content: '', done: true });

        return {
            content: fullContent,
            model: this.config.model || this.DEFAULT_MODEL
        };
    }

    formatContextInjection(context: string): ChatMessage {
        return {
            role: 'system',
            content: `You are continuing a conversation. Here is the preserved context from previous interactions:\n\n${context}`
        };
    }

    estimateTokens(text: string): number {
        return Math.ceil(text.length / this.CHARS_PER_TOKEN);
    }

    getMaxContextTokens(): number {
        return this.MAX_TOKENS;
    }

    async testConnection(): Promise<boolean> {
        try {
            await this.sendMessage([
                { role: 'user', content: 'Hi' }
            ]);
            return true;
        } catch {
            return false;
        }
    }

    private separateSystemMessage(messages: ChatMessage[]): { system: string; chat: ChatMessage[] } {
        const systemMessages = messages.filter(m => m.role === 'system');
        const chatMessages = messages.filter(m => m.role !== 'system');

        return {
            system: systemMessages.map(m => m.content).join('\n\n'),
            chat: chatMessages
        };
    }
}

// Register adapter
ModelAdapterFactory.register('claude', ClaudeAdapter);
