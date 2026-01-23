import { SessionGraph, GraphNode } from '../layers/sessionGraph';
import { VectorStore, VectorEntry } from '../layers/vectorStore';
import { TokenBudget } from '../../core/tokenBudget';

interface RetrievalResult {
    content: string;
    source: 'graph' | 'vector';
    score: number;
}

/**
 * Hybrid Retriever combining Graph RAG + Vector RAG
 * Uses Reciprocal Rank Fusion to merge results
 */
export class HybridRetriever {
    private sessionGraph: SessionGraph;
    private vectorStore: VectorStore;
    private tokenBudget: TokenBudget;

    constructor(sessionGraph: SessionGraph, vectorStore: VectorStore) {
        this.sessionGraph = sessionGraph;
        this.vectorStore = vectorStore;
        this.tokenBudget = new TokenBudget();
    }

    /**
     * Retrieve context using hybrid approach
     */
    async retrieve(query: string, tokenBudget: number): Promise<string> {
        // 1. Graph traversal from current intent
        const graphResults = await this.graphSearch(query);

        // 2. Vector semantic search
        const vectorResults = await this.vectorSearch(query);

        // 3. Reciprocal Rank Fusion
        const fusedResults = this.reciprocalRankFusion(graphResults, vectorResults);

        // 4. Token-aware selection
        return this.selectWithinBudget(fusedResults, tokenBudget);
    }

    private async graphSearch(query: string): Promise<RetrievalResult[]> {
        // Get all intents and find most relevant to query
        const intents = this.sessionGraph.getIntents();
        const decisions = this.sessionGraph.getDecisions();

        const results: RetrievalResult[] = [];

        // Add intents with decreasing score
        intents.forEach((node, idx) => {
            results.push({
                content: `[INTENT] ${node.content}`,
                source: 'graph',
                score: 1.0 - (idx * 0.1)
            });
        });

        // Traverse from latest intent
        if (intents.length > 0) {
            const latest = intents[intents.length - 1];
            const connected = this.sessionGraph.traverse(latest.id, 2, ['Decision', 'CodeArtifact', 'Solution']);

            connected.forEach((node, idx) => {
                results.push({
                    content: `[${node.type.toUpperCase()}] ${node.content}`,
                    source: 'graph',
                    score: 0.8 - (idx * 0.05)
                });
            });
        }

        return results;
    }

    private async vectorSearch(query: string): Promise<RetrievalResult[]> {
        const entries = await this.vectorStore.search(query, 10);

        return entries.map((entry, idx) => ({
            content: entry.content,
            source: 'vector' as const,
            score: 1.0 - (idx * 0.1)
        }));
    }

    /**
     * Reciprocal Rank Fusion to combine graph and vector results
     */
    private reciprocalRankFusion(
        graphResults: RetrievalResult[],
        vectorResults: RetrievalResult[]
    ): RetrievalResult[] {
        const k = 60; // RRF constant
        const fusedScores = new Map<string, { result: RetrievalResult; score: number }>();

        // Score graph results
        graphResults.forEach((result, rank) => {
            const key = result.content;
            const rrf = 1 / (k + rank + 1);
            fusedScores.set(key, { result, score: rrf });
        });

        // Add/combine vector results
        vectorResults.forEach((result, rank) => {
            const key = result.content;
            const rrf = 1 / (k + rank + 1);

            if (fusedScores.has(key)) {
                fusedScores.get(key)!.score += rrf;
            } else {
                fusedScores.set(key, { result, score: rrf });
            }
        });

        // Sort by fused score
        return Array.from(fusedScores.values())
            .sort((a, b) => b.score - a.score)
            .map(item => item.result);
    }

    /**
     * Select results within token budget
     */
    private selectWithinBudget(results: RetrievalResult[], budget: number): string {
        const selected: string[] = [];
        let remaining = budget;

        for (const result of results) {
            const tokens = this.tokenBudget.countTokens(result.content);
            if (tokens <= remaining) {
                selected.push(result.content);
                remaining -= tokens;
            }
        }

        return selected.join('\n\n');
    }
}
