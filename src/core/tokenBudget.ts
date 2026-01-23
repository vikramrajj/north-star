/**
 * Token counting and budget management
 */
export class TokenBudget {
    // Approximate tokens per character (conservative estimate)
    private readonly CHARS_PER_TOKEN = 4;

    // Context window allocations per model (tokens we can use for memory)
    private readonly MODEL_BUDGETS: Record<string, number> = {
        'claude': 15000,    // ~7.5% of 200K
        'gemini': 50000,    // ~5% of 1M
        'openai': 10000,    // ~8% of 128K
    };

    // Budget allocation within total
    private readonly ALLOCATION = {
        objectives: 0.125,      // 12.5%
        immediate: 0.25,        // 25%
        highlights: 0.1875,     // 18.75%
        graphRetrieved: 0.25,   // 25%
        vectorRetrieved: 0.1875 // 18.75%
    };

    getBudgetForModel(model: string): number {
        return this.MODEL_BUDGETS[model] || 8000;
    }

    getAllocation(model: string): Record<string, number> {
        const total = this.getBudgetForModel(model);
        return {
            objectives: Math.floor(total * this.ALLOCATION.objectives),
            immediate: Math.floor(total * this.ALLOCATION.immediate),
            highlights: Math.floor(total * this.ALLOCATION.highlights),
            graphRetrieved: Math.floor(total * this.ALLOCATION.graphRetrieved),
            vectorRetrieved: Math.floor(total * this.ALLOCATION.vectorRetrieved)
        };
    }

    countTokens(text: string): number {
        // Simple approximation - in production use tiktoken or similar
        return Math.ceil(text.length / this.CHARS_PER_TOKEN);
    }

    fitToTokenBudget(items: string[], budget: number): string[] {
        const result: string[] = [];
        let remaining = budget;

        for (const item of items) {
            const tokens = this.countTokens(item);
            if (tokens <= remaining) {
                result.push(item);
                remaining -= tokens;
            }
        }

        return result;
    }
}
