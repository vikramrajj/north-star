import { Message } from '../../core/contextBridge';

/**
 * Layer 1: Immediate Context
 * Stores the last N messages for quick access (always included in context)
 */
export class ImmediateContext {
    private messages: Message[] = [];
    private readonly MAX_MESSAGES = 5;

    addMessage(message: Message): void {
        this.messages.push(message);
        if (this.messages.length > this.MAX_MESSAGES) {
            this.messages.shift();
        }
    }

    getContext(): string {
        return this.messages
            .map(m => `${m.role.toUpperCase()}: ${m.content}`)
            .join('\n\n');
    }

    getMessages(): Message[] {
        return [...this.messages];
    }

    clear(): void {
        this.messages = [];
    }
}
