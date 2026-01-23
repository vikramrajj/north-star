import * as vscode from 'vscode';

export type HighlightType = 'DECISION' | 'BLOCKER' | 'SOLUTION' | 'MILESTONE' | 'USER_MARKED';

export interface Highlight {
    id: string;
    type: HighlightType;
    content: string;
    messageIndex: number;
    timestamp: Date;
    resolved?: boolean;
}

/**
 * Extracts and tracks important moments in conversation
 */
export class HighlightExtractor {
    private highlights: Highlight[] = [];
    private context: vscode.ExtensionContext;

    // Patterns to auto-detect highlights
    private readonly PATTERNS: { type: HighlightType; patterns: RegExp[] }[] = [
        {
            type: 'DECISION',
            patterns: [
                /let's (use|go with|choose|pick|implement|adopt) (.+)/i,
                /we('ll| will| should) (use|go with|implement) (.+)/i,
                /decided to (.+)/i,
                /decision:?\s*(.+)/i
            ]
        },
        {
            type: 'BLOCKER',
            patterns: [
                /error:?\s*(.+)/i,
                /exception:?\s*(.+)/i,
                /failed:?\s*(.+)/i,
                /cannot (.+)/i,
                /unable to (.+)/i,
                /blocked:?\s*(.+)/i,
                /issue:?\s*(.+)/i
            ]
        },
        {
            type: 'SOLUTION',
            patterns: [
                /fixed (by|with|using) (.+)/i,
                /solved (by|with) (.+)/i,
                /the (fix|solution) (is|was) (.+)/i,
                /resolved:?\s*(.+)/i,
                /working now/i
            ]
        },
        {
            type: 'MILESTONE',
            patterns: [
                /✓\s*(.+)/,
                /done:?\s*(.+)/i,
                /completed:?\s*(.+)/i,
                /finished:?\s*(.+)/i,
                /tests? (are )?(passing|passed)/i,
                /successfully (.+)/i
            ]
        }
    ];

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.loadFromStorage();
    }

    /**
     * Extract highlights from a message
     */
    extractFromMessage(content: string, messageIndex: number): Highlight[] {
        const extracted: Highlight[] = [];

        for (const { type, patterns } of this.PATTERNS) {
            for (const pattern of patterns) {
                const match = content.match(pattern);
                if (match) {
                    const highlight: Highlight = {
                        id: this.generateId(),
                        type,
                        content: match[0],
                        messageIndex,
                        timestamp: new Date(),
                        resolved: false
                    };
                    extracted.push(highlight);
                    this.highlights.push(highlight);
                    break; // Only one highlight per type per message
                }
            }
        }

        if (extracted.length > 0) {
            this.saveToStorage();
        }

        return extracted;
    }

    /**
     * Manually mark content as a highlight
     */
    markAsHighlight(content: string, type: HighlightType, messageIndex: number): Highlight {
        const highlight: Highlight = {
            id: this.generateId(),
            type,
            content,
            messageIndex,
            timestamp: new Date()
        };
        this.highlights.push(highlight);
        this.saveToStorage();
        return highlight;
    }

    /**
     * Resolve a blocker
     */
    resolveHighlight(id: string): void {
        const highlight = this.highlights.find(h => h.id === id);
        if (highlight) {
            highlight.resolved = true;
            this.saveToStorage();
        }
    }

    /**
     * Get unresolved blockers
     */
    getUnresolvedBlockers(): Highlight[] {
        return this.highlights.filter(h => h.type === 'BLOCKER' && !h.resolved);
    }

    /**
     * Get all decisions
     */
    getDecisions(): Highlight[] {
        return this.highlights.filter(h => h.type === 'DECISION');
    }

    /**
     * Get highlights for context injection
     */
    getHighlightsForContext(): string {
        const decisions = this.getDecisions();
        const blockers = this.getUnresolvedBlockers();
        const milestones = this.highlights.filter(h => h.type === 'MILESTONE').slice(-5);

        let context = '';

        if (decisions.length > 0) {
            context += '## Key Decisions\n';
            context += decisions.map((d, i) => `${i + 1}. ${d.content}`).join('\n');
            context += '\n\n';
        }

        if (blockers.length > 0) {
            context += '## Open Issues\n';
            context += blockers.map(b => `- ⚠️ ${b.content}`).join('\n');
            context += '\n\n';
        }

        if (milestones.length > 0) {
            context += '## Recent Milestones\n';
            context += milestones.map(m => `- ✓ ${m.content}`).join('\n');
        }

        return context;
    }

    getAllHighlights(): Highlight[] {
        return this.highlights;
    }

    private generateId(): string {
        return `hl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private loadFromStorage(): void {
        const stored = this.context.globalState.get<Highlight[]>('highlights');
        if (stored) {
            this.highlights = stored;
        }
    }

    private saveToStorage(): void {
        this.context.globalState.update('highlights', this.highlights);
    }

    clear(): void {
        this.highlights = [];
        this.saveToStorage();
    }
}
