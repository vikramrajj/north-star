/**
 * Base interface for all model adapters
 * Designed for cross-IDE compatibility (VS Code, Cursor, Windsurf, VSCodium, etc.)
 */

export interface ModelConfig {
    apiKey: string;
    baseUrl?: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
}

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface StreamChunk {
    content: string;
    done: boolean;
}

export interface ModelResponse {
    content: string;
    model: string;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

/**
 * Abstract base class for model adapters
 * Using dependency inversion - adapters depend on this interface
 */
export abstract class BaseModelAdapter {
    protected config: ModelConfig;
    protected name: string;

    constructor(name: string, config: ModelConfig) {
        this.name = name;
        this.config = config;
    }

    /**
     * Get the adapter name
     */
    getName(): string {
        return this.name;
    }

    /**
     * Send a message and get a response
     */
    abstract sendMessage(messages: ChatMessage[]): Promise<ModelResponse>;

    /**
     * Stream a response (for real-time display)
     */
    abstract streamMessage(
        messages: ChatMessage[],
        onChunk: (chunk: StreamChunk) => void
    ): Promise<ModelResponse>;

    /**
     * Format context for injection (model-specific formatting)
     */
    abstract formatContextInjection(context: string): ChatMessage;

    /**
     * Estimate token count for text
     */
    abstract estimateTokens(text: string): number;

    /**
     * Get maximum context window size
     */
    abstract getMaxContextTokens(): number;

    /**
     * Test connection to the API
     */
    abstract testConnection(): Promise<boolean>;

    /**
     * Create system message with context
     */
    protected createSystemMessage(baseSystem: string, context: string): ChatMessage {
        return {
            role: 'system',
            content: `${baseSystem}\n\n---\n\n# Preserved Context\n\n${context}`
        };
    }
}

/**
 * Factory for creating model adapters
 */
export class ModelAdapterFactory {
    private static adapters: Map<string, new (config: ModelConfig) => BaseModelAdapter> = new Map();

    static register(name: string, adapter: new (config: ModelConfig) => BaseModelAdapter): void {
        this.adapters.set(name, adapter);
    }

    static create(name: string, config: ModelConfig): BaseModelAdapter | null {
        const AdapterClass = this.adapters.get(name);
        if (AdapterClass) {
            return new AdapterClass(config);
        }
        return null;
    }

    static getAvailableModels(): string[] {
        return Array.from(this.adapters.keys());
    }
}
