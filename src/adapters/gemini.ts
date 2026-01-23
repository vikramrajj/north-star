import {
    BaseModelAdapter,
    ModelConfig,
    ChatMessage,
    ModelResponse,
    StreamChunk,
    ModelAdapterFactory
} from './base';

/**
 * Gemini (Google) Model Adapter
 */
export class GeminiAdapter extends BaseModelAdapter {
    private readonly DEFAULT_MODEL = 'gemini-1.5-pro';
    private readonly MAX_TOKENS = 1000000; // 1M context window
    private readonly CHARS_PER_TOKEN = 4;

    constructor(config: ModelConfig) {
        super('gemini', config);
    }

    async sendMessage(messages: ChatMessage[]): Promise<ModelResponse> {
        const { systemInstruction, contents } = this.formatMessages(messages);
        const model = this.config.model || this.DEFAULT_MODEL;
        const baseUrl = this.config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';

        const response = await fetch(
            `${baseUrl}/models/${model}:generateContent?key=${this.config.apiKey}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
                    contents,
                    generationConfig: {
                        maxOutputTokens: this.config.maxTokens || 8192,
                        temperature: this.config.temperature || 0.7
                    }
                })
            }
        );

        if (!response.ok) {
            throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json() as any;
        const content = data.candidates[0].content.parts[0].text;

        return {
            content,
            model,
            usage: data.usageMetadata ? {
                promptTokens: data.usageMetadata.promptTokenCount,
                completionTokens: data.usageMetadata.candidatesTokenCount,
                totalTokens: data.usageMetadata.totalTokenCount
            } : undefined
        };
    }

    async streamMessage(
        messages: ChatMessage[],
        onChunk: (chunk: StreamChunk) => void
    ): Promise<ModelResponse> {
        const { systemInstruction, contents } = this.formatMessages(messages);
        const model = this.config.model || this.DEFAULT_MODEL;
        const baseUrl = this.config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';

        const response = await fetch(
            `${baseUrl}/models/${model}:streamGenerateContent?alt=sse&key=${this.config.apiKey}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
                    contents,
                    generationConfig: {
                        maxOutputTokens: this.config.maxTokens || 8192,
                        temperature: this.config.temperature || 0.7
                    }
                })
            }
        );

        if (!response.ok || !response.body) {
            throw new Error(`Gemini API error: ${response.status}`);
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
                try {
                    const data = JSON.parse(line.slice(6));
                    if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
                        const text = data.candidates[0].content.parts[0].text;
                        fullContent += text;
                        onChunk({ content: text, done: false });
                    }
                } catch {
                    // Skip malformed JSON
                }
            }
        }

        onChunk({ content: '', done: true });

        return {
            content: fullContent,
            model
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

    private formatMessages(messages: ChatMessage[]): {
        systemInstruction: string | null;
        contents: { role: string; parts: { text: string }[] }[]
    } {
        const systemMessages = messages.filter(m => m.role === 'system');
        const chatMessages = messages.filter(m => m.role !== 'system');

        return {
            systemInstruction: systemMessages.length > 0
                ? systemMessages.map(m => m.content).join('\n\n')
                : null,
            contents: chatMessages.map(m => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }]
            }))
        };
    }
}

// Register adapter
ModelAdapterFactory.register('gemini', GeminiAdapter);
