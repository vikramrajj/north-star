import { SessionGraph, GraphNode, NodeType, EdgeType } from '../layers/sessionGraph';

/**
 * Extracts entities and relationships from conversation messages
 * Used to build the knowledge graph for Graph RAG
 */
export class EntityExtractor {
    private sessionGraph: SessionGraph;

    // Patterns to detect different entity types
    private readonly ENTITY_PATTERNS: { type: NodeType; patterns: RegExp[] }[] = [
        {
            type: 'Intent',
            patterns: [
                /i want to (build|create|make|implement|develop) (.+)/i,
                /let's (build|create|make|implement|develop) (.+)/i,
                /goal is to (.+)/i,
                /trying to (.+)/i,
                /need to (.+)/i
            ]
        },
        {
            type: 'Decision',
            patterns: [
                /let's use (.+)/i,
                /we('ll| will| should) use (.+)/i,
                /going with (.+)/i,
                /decided on (.+)/i
            ]
        },
        {
            type: 'CodeArtifact',
            patterns: [
                /created? (.+\.(ts|js|py|java|go|rs|cpp|c|h|css|html|json|yaml|yml))/i,
                /file (.+\.(ts|js|py|java|go|rs|cpp|c|h|css|html|json|yaml|yml))/i,
                /in (.+\.(ts|js|py|java|go|rs|cpp|c|h|css|html|json|yaml|yml))/i
            ]
        },
        {
            type: 'Error',
            patterns: [
                /error:?\s*(.+)/i,
                /exception:?\s*(.+)/i,
                /failed:?\s*(.+)/i,
                /TypeError:?\s*(.+)/i,
                /ReferenceError:?\s*(.+)/i
            ]
        },
        {
            type: 'Solution',
            patterns: [
                /fixed by (.+)/i,
                /solved by (.+)/i,
                /the fix is (.+)/i,
                /solution:?\s*(.+)/i
            ]
        },
        {
            type: 'Preference',
            patterns: [
                /prefer (.+)/i,
                /like (.+) better/i,
                /always use (.+)/i,
                /convention is (.+)/i
            ]
        }
    ];

    // Relationship patterns
    private readonly RELATION_PATTERNS: { type: EdgeType; patterns: RegExp[] }[] = [
        {
            type: 'LED_TO',
            patterns: [
                /led to/i,
                /resulted in/i,
                /caused/i,
                /then/i
            ]
        },
        {
            type: 'RESOLVED_BY',
            patterns: [
                /fixed by/i,
                /solved by/i,
                /resolved by/i
            ]
        },
        {
            type: 'IMPLEMENTED_IN',
            patterns: [
                /implemented in/i,
                /added to/i,
                /created in/i,
                /updated in/i
            ]
        },
        {
            type: 'DEPENDS_ON',
            patterns: [
                /depends on/i,
                /requires/i,
                /needs/i,
                /imports/i
            ]
        }
    ];

    constructor(sessionGraph: SessionGraph) {
        this.sessionGraph = sessionGraph;
    }

    /**
     * Extract entities from a message and add to graph
     */
    async extractEntities(content: string): Promise<GraphNode[]> {
        const extracted: GraphNode[] = [];

        for (const { type, patterns } of this.ENTITY_PATTERNS) {
            for (const pattern of patterns) {
                const matches = content.matchAll(new RegExp(pattern, 'gi'));
                for (const match of matches) {
                    const entityContent = match[2] || match[1] || match[0];
                    const node: GraphNode = {
                        id: this.generateId(type),
                        type,
                        content: entityContent.trim(),
                        createdAt: new Date()
                    };
                    await this.sessionGraph.addNode(node);
                    extracted.push(node);
                }
            }
        }

        return extracted;
    }

    /**
     * Extract relationships between entities
     */
    async extractRelations(content: string, recentNodes: GraphNode[]): Promise<void> {
        if (recentNodes.length < 2) return;

        // Check for explicit relationship patterns
        for (const { type, patterns } of this.RELATION_PATTERNS) {
            for (const pattern of patterns) {
                if (pattern.test(content)) {
                    // Connect the two most recent relevant nodes
                    const lastTwo = recentNodes.slice(-2);
                    if (lastTwo.length === 2) {
                        await this.sessionGraph.addEdge({
                            from: lastTwo[0].id,
                            to: lastTwo[1].id,
                            type
                        });
                    }
                    break;
                }
            }
        }

        // Auto-connect errors to solutions
        const errors = recentNodes.filter(n => n.type === 'Error');
        const solutions = recentNodes.filter(n => n.type === 'Solution');

        for (const error of errors) {
            for (const solution of solutions) {
                if (solution.createdAt > error.createdAt) {
                    await this.sessionGraph.addEdge({
                        from: error.id,
                        to: solution.id,
                        type: 'RESOLVED_BY'
                    });
                }
            }
        }

        // Auto-connect decisions to code artifacts
        const decisions = recentNodes.filter(n => n.type === 'Decision');
        const artifacts = recentNodes.filter(n => n.type === 'CodeArtifact');

        for (const decision of decisions) {
            for (const artifact of artifacts) {
                if (artifact.createdAt >= decision.createdAt) {
                    await this.sessionGraph.addEdge({
                        from: decision.id,
                        to: artifact.id,
                        type: 'IMPLEMENTED_IN'
                    });
                }
            }
        }
    }

    /**
     * Process a message and update the graph
     */
    async processMessage(content: string): Promise<GraphNode[]> {
        const entities = await this.extractEntities(content);

        if (entities.length > 0) {
            // Get recent nodes for relationship extraction
            const intents = this.sessionGraph.getIntents();
            const decisions = this.sessionGraph.getDecisions();
            const recentNodes = [...intents, ...decisions, ...entities]
                .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
                .slice(-10);

            await this.extractRelations(content, recentNodes);
        }

        return entities;
    }

    private generateId(type: NodeType): string {
        return `${type.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    }
}
