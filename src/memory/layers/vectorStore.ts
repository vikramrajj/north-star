import * as vscode from 'vscode';

export interface VectorEntry {
    id: string;
    content: string;
    embedding: number[];
    metadata?: Record<string, any>;
}

/**
 * Layer 3: Vector Store
 * Semantic search using embeddings
 * 
 * Note: In production, use a proper vector DB like ChromaDB or SQLite-VSS
 * This is a simplified in-memory implementation
 */
export class VectorStore {
    private entries: VectorEntry[] = [];
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.loadFromStorage();
    }

    /**
     * Add content with embedding
     */
    async add(id: string, content: string, metadata?: Record<string, any>): Promise<void> {
        const embedding = await this.generateEmbedding(content);
        this.entries.push({ id, content, embedding, metadata });
        this.saveToStorage();
    }

    /**
     * Semantic search - find most similar entries
     */
    async search(query: string, k: number = 10): Promise<VectorEntry[]> {
        const queryEmbedding = await this.generateEmbedding(query);

        // Calculate similarity scores
        const scored = this.entries.map(entry => ({
            entry,
            score: this.cosineSimilarity(queryEmbedding, entry.embedding)
        }));

        // Sort by similarity and return top k
        return scored
            .sort((a, b) => b.score - a.score)
            .slice(0, k)
            .map(s => s.entry);
    }

    /**
     * Generate embedding for text
     * TODO: Replace with actual embedding model (local or API)
     */
    private async generateEmbedding(text: string): Promise<number[]> {
        // Simple hash-based embedding for demo
        // In production: use all-MiniLM-L6-v2 (local) or OpenAI embeddings (API)
        const hash = this.simpleHash(text);
        const embedding = new Array(384).fill(0);

        for (let i = 0; i < Math.min(text.length, 384); i++) {
            embedding[i] = (text.charCodeAt(i) + hash) / 255;
        }

        return embedding;
    }

    private simpleHash(str: string): number {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash);
    }

    private cosineSimilarity(a: number[], b: number[]): number {
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }

        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    private loadFromStorage(): void {
        const stored = this.context.globalState.get<VectorEntry[]>('vectorStore');
        if (stored) {
            this.entries = stored;
        }
    }

    private saveToStorage(): void {
        this.context.globalState.update('vectorStore', this.entries);
    }

    clear(): void {
        this.entries = [];
        this.saveToStorage();
    }
}
