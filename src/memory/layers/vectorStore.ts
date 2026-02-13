import * as vscode from 'vscode';
import { LocalEmbeddingModel } from '../../memory/retrieval/localEmbeddings';
import { SQLiteManager } from '../../storage/sqliteManager';

export interface VectorEntry {
    id: string;
    content: string;
    embedding: number[];
    metadata?: Record<string, any>;
}

/**
 * Layer 3: Vector Store (SQLite Backed)
 * Semantic search using embeddings
 */
export class VectorStore {
    private dbManager: SQLiteManager;
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.dbManager = SQLiteManager.getInstance();
    }

    /**
     * Add content with embedding
     */
    async add(id: string, content: string, metadata?: Record<string, any>): Promise<void> {
        const embedding = await this.generateEmbedding(content);
        // Convert to Buffer for BLOB storage
        const buffer = Buffer.from(new Float32Array(embedding).buffer);

        const stmt = this.dbManager.getDB().prepare(`
            INSERT OR REPLACE INTO vectors(id, content, embedding, metadata, created_at)
VALUES(?, ?, ?, ?, ?)
    `);

        stmt.run(
            id,
            content,
            buffer,
            JSON.stringify(metadata || {}),
            Date.now()
        );
    }

    /**
     * Semantic search - find most similar entries
     */
    async search(query: string, k: number = 10): Promise<VectorEntry[]> {
        const queryEmbedding = await this.generateEmbedding(query);

        // Fetch all vectors (Full Scan - optimized by native SQLite speed)
        // For <10k rows, this is remarkably fast.
        // For >10k, we would need an index (IVF) or sqlite-vss.
        const stmt = this.dbManager.getDB().prepare('SELECT id, content, embedding, metadata FROM vectors');
        const rows = stmt.all() as any[];

        const scored = rows.map(row => {
            // Reconstruct Float32Array from Buffer
            const buffer = row.embedding as Buffer;
            const vector = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);

            return {
                entry: {
                    id: row.id,
                    content: row.content,
                    embedding: Array.from(vector), // Convert back to number[] for interface
                    metadata: JSON.parse(row.metadata || '{}')
                },
                score: this.cosineSimilarity(queryEmbedding, vector)
            };
        });

        // Sort by similarity and return top k
        return scored
            .sort((a, b) => b.score - a.score)
            .slice(0, k)
            .map(s => s.entry);
    }

    /**
     * Generate embedding for text
     */
    private async generateEmbedding(text: string): Promise<number[]> {
        // Use real local embedding model
        try {
            const model = LocalEmbeddingModel.getInstance();
            // Ensure initialized with storage path
            await model.initialize(this.context.globalStorageUri.fsPath);
            return await model.generate(text);
        } catch (error) {
            console.error('Embedding generation failed, falling back to zero vector:', error);
            return new Array(384).fill(0);
        }
    }

    private cosineSimilarity(a: number[], b: Float32Array): number {
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

    clear(): void {
        this.dbManager.getDB().exec('DELETE FROM vectors');
    }
}
