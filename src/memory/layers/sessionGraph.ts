import * as vscode from 'vscode';
import { SQLiteManager } from '../../storage/sqliteManager';

/**
 * Node types in the knowledge graph
 */
export type NodeType = 'Intent' | 'Decision' | 'CodeArtifact' | 'Error' | 'Solution' | 'Preference';

/**
 * Edge types representing relationships
 */
export type EdgeType = 'LED_TO' | 'RESOLVED_BY' | 'IMPLEMENTED_IN' | 'CONFLICTS_WITH' | 'DEPENDS_ON';

export interface GraphNode {
    id: string;
    type: NodeType;
    content: string;
    metadata?: Record<string, any>;
    createdAt: Date;
}

export interface GraphEdge {
    from: string;
    to: string;
    type: EdgeType;
    weight?: number;
}

/**
 * Layer 2: Session Knowledge Graph (SQLite Backed)
 * Stores entities and their relationships for structured retrieval
 */
export class SessionGraph {
    private dbManager: SQLiteManager;

    constructor(context: vscode.ExtensionContext) {
        this.dbManager = SQLiteManager.getInstance();
        // Database should be initialized by ContextBridge
    }

    async initialize(): Promise<void> {
        // No-op, DB initialized globally
    }

    async addNode(node: GraphNode): Promise<void> {
        const stmt = this.dbManager.getDB().prepare(`
            INSERT OR REPLACE INTO graph_nodes (id, type, content, metadata, created_at)
            VALUES (?, ?, ?, ?, ?)
        `);

        stmt.run(
            node.id,
            node.type,
            node.content,
            JSON.stringify(node.metadata || {}),
            node.createdAt.getTime()
        );
    }

    async addEdge(edge: GraphEdge): Promise<void> {
        const stmt = this.dbManager.getDB().prepare(`
            INSERT OR REPLACE INTO graph_edges (source, target, type, weight, created_at)
            VALUES (?, ?, ?, ?, ?)
        `);

        stmt.run(
            edge.from,
            edge.to,
            edge.type,
            edge.weight || 1.0,
            Date.now()
        );
    }

    /**
     * Traverse graph from a starting node up to specified depth (BFS)
     */
    traverse(startId: string, depth: number = 3, nodeTypes?: NodeType[]): GraphNode[] {
        const visited = new Set<string>();
        const result: GraphNode[] = [];
        let queue: { id: string, depth: number }[] = [{ id: startId, depth: 0 }];

        const nodeStmt = this.dbManager.getDB().prepare('SELECT * FROM graph_nodes WHERE id = ?');
        const edgesStmt = this.dbManager.getDB().prepare('SELECT * FROM graph_edges WHERE source = ? OR target = ?');

        while (queue.length > 0) {
            const { id, depth: currentDepth } = queue.shift()!;

            if (currentDepth > depth || visited.has(id)) continue;
            visited.add(id);

            // Fetch node
            const row = nodeStmt.get(id) as any;
            if (row) {
                const node = this.mapRowToNode(row);
                if (!nodeTypes || nodeTypes.includes(node.type)) {
                    result.push(node);
                }
            }

            if (currentDepth < depth) {
                // Fetch connected edges
                const edges = edgesStmt.all(id) as any[];
                for (const edge of edges) {
                    const nextId = edge.source === id ? edge.target : edge.source;
                    if (!visited.has(nextId)) {
                        queue.push({ id: nextId, depth: currentDepth + 1 });
                    }
                }
            }
        }

        return result;
    }

    /**
     * Find nodes by type
     */
    getNodesByType(type: NodeType): GraphNode[] {
        const stmt = this.dbManager.getDB().prepare('SELECT * FROM graph_nodes WHERE type = ? ORDER BY created_at DESC');
        const rows = stmt.all(type) as any[];
        return rows.map(this.mapRowToNode);
    }

    /**
     * Get all decisions made in the session
     */
    getDecisions(): GraphNode[] {
        return this.getNodesByType('Decision');
    }

    /**
     * Get current intents
     */
    getIntents(): GraphNode[] {
        return this.getNodesByType('Intent');
    }

    async clear(): Promise<void> {
        this.dbManager.getDB().exec('DELETE FROM graph_nodes');
        this.dbManager.getDB().exec('DELETE FROM graph_edges');
    }

    private mapRowToNode(row: any): GraphNode {
        return {
            id: row.id,
            type: row.type as NodeType,
            content: row.content,
            metadata: JSON.parse(row.metadata || '{}'),
            createdAt: new Date(row.created_at)
        };
    }
}
