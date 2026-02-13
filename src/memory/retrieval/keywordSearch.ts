import * as vscode from 'vscode';
import { Message } from '../../core/contextBridge';
import { FileStorage, StorageFiles } from '../../storage/fileStorage';

interface SearchResult {
    content: string;
    score: number;
    timestamp: Date;
}

/**
 * Simple Keyword Search implementation to replace Vector Search
 * Uses BM25-like scoring for relevance without embeddings
 */
export class KeywordSearch {
    private storage: FileStorage;
    private messages: Message[] = [];

    constructor(context: vscode.ExtensionContext) {
        this.storage = new FileStorage(context);
        // init must be called
    }

    async initialize(): Promise<void> {
        await this.loadMessages();
    }

    /**
     * Search messages for keywords
     */
    search(query: string, limit: number = 10): SearchResult[] {
        const keywords = this.tokenize(query);
        const results: SearchResult[] = [];

        for (const msg of this.messages) {
            const score = this.calculateScore(msg.content, keywords);
            if (score > 0) {
                results.push({
                    content: msg.content,
                    score,
                    timestamp: new Date(msg.timestamp)
                });
            }
        }

        return results
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }

    /**
     * Add a message to the index (in this case, just the list)
     */
    addMessage(message: Message): void {
        this.messages.push(message);
        // Persistence handled by main message storage
    }

    private calculateScore(content: string, keywords: string[]): number {
        const contentLower = content.toLowerCase();
        let score = 0;

        for (const keyword of keywords) {
            // Exact match
            if (contentLower.includes(keyword)) {
                score += 1;
            }
            // Whole word match bonus
            if (new RegExp(`\\b${this.escapeRegExp(keyword)}\\b`).test(contentLower)) {
                score += 0.5;
            }
        }

        return score;
    }

    private tokenize(text: string): string[] {
        return text.toLowerCase()
            .replace(/[^\w\s]/g, '')
            .split(/\s+/)
            .filter(w => w.length > 2 && !this.isStopWord(w));
    }

    private isStopWord(word: string): boolean {
        const stopWords = new Set(['the', 'and', 'for', 'that', 'this', 'with', 'you', 'are']);
        return stopWords.has(word);
    }

    private escapeRegExp(string: string): string {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    private async loadMessages(): Promise<void> {
        const data = await this.storage.read<{ messages: Message[] }>(StorageFiles.SESSION_STATE, { messages: [] });
        this.messages = data.messages || [];
    }
}
