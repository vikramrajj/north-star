import {
    BaseModelAdapter,
    ModelConfig,
    ChatMessage,
    ModelResponse,
    StreamChunk,
    ModelAdapterFactory
} from './base';

/**
 * OpenAI (GPT/Codex) Model Adapter
 */
export class OpenAIAdapter extends BaseModelAdapter {
    private readonly DEFAULT_MODEL = 'gpt-4o';
    private readonly MAX_TOKENS = 128000;
    private readonly CHARS_PER_TOKEN = 4;

    constructor(config: ModelConfig) {
        super('openai', config);
    }

    async sendMessage(messages: ChatMessage[]): Promise<ModelResponse> {
        const response = await fetch(this.config.baseUrl || 'https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.config.apiKey}`
            },
            body: JSON.stringify({
                model: this.config.model || this.DEFAULT_MODEL,
                max_tokens: this.config.maxTokens || 4096,
                temperature: this.config.temperature || 0.7,
                messages: messages.map(m => ({
                    role: m.role,
                    content: m.content
                }))
            })
        });

        if (!response.ok) {
            throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json() as any;

        return {
            content: data.choices[0].message.content,
            model: data.model,
            usage: {
                promptTokens: data.usage.prompt_tokens,
                completionTokens: data.usage.completion_tokens,
                totalTokens: data.usage.total_tokens
            }
        };
    }

    async streamMessage(
        messages: ChatMessage[],
        onChunk: (chunk: StreamChunk) => void
    ): Promise<ModelResponse> {
        const response = await fetch(this.config.baseUrl || 'https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.config.apiKey}`
            },
            body: JSON.stringify({
                model: this.config.model || this.DEFAULT_MODEL,
                max_tokens: this.config.maxTokens || 4096,
                temperature: this.config.temperature || 0.7,
                stream: true,
                messages: messages.map(m => ({
                    role: m.role,
                    content: m.content
                }))
            })
        });

        if (!response.ok || !response.body) {
            throw new Error(`OpenAI API error: ${response.status}`);
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
                if (line === 'data: [DONE]') continue;

                try {
                    const data = JSON.parse(line.slice(6));
                    const content = data.choices[0]?.delta?.content;
                    if (content) {
                        fullContent += content;
                        onChunk({ content, done: false });
                    }
                } catch {
                    // Skip malformed JSON
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
        // More accurate approximation for OpenAI models
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
}

// Register adapter
ModelAdapterFactory.register('openai', OpenAIAdapter);
