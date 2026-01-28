import * as vscode from 'vscode';
import { FileStorage, StorageFiles } from '../../storage/fileStorage';

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
 * Layer 2: Session Knowledge Graph
 * Stores entities and their relationships for structured retrieval
 */
export class SessionGraph {
    private nodes: Map<string, GraphNode> = new Map();
    private edges: GraphEdge[] = [];
    private storage: FileStorage;

    constructor(context: vscode.ExtensionContext) {
        this.storage = new FileStorage(context);
        this.loadFromStorage();
    }

    addNode(node: GraphNode): void {
        this.nodes.set(node.id, node);
        this.saveToStorage();
    }

    addEdge(edge: GraphEdge): void {
        this.edges.push(edge);
        this.saveToStorage();
    }

    /**
     * Traverse graph from a starting node up to specified depth
     */
    traverse(startId: string, depth: number = 3, nodeTypes?: NodeType[]): GraphNode[] {
        const visited = new Set<string>();
        const result: GraphNode[] = [];

        const dfs = (nodeId: string, currentDepth: number) => {
            if (currentDepth > depth || visited.has(nodeId)) return;
            visited.add(nodeId);

            const node = this.nodes.get(nodeId);
            if (node && (!nodeTypes || nodeTypes.includes(node.type))) {
                result.push(node);
            }

            // Find connected nodes
            const connectedEdges = this.edges.filter(e => e.from === nodeId || e.to === nodeId);
            for (const edge of connectedEdges) {
                const nextId = edge.from === nodeId ? edge.to : edge.from;
                dfs(nextId, currentDepth + 1);
            }
        };

        dfs(startId, 0);
        return result;
    }

    /**
     * Find nodes by type
     */
    getNodesByType(type: NodeType): GraphNode[] {
        return Array.from(this.nodes.values()).filter(n => n.type === type);
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

    private loadFromStorage(): void {
        const data = this.storage.read<{ nodes: [string, GraphNode][]; edges: GraphEdge[] }>(
            StorageFiles.GRAPH_NODES,
            { nodes: [], edges: [] }
        );

        if (data && data.nodes) {
            this.nodes = new Map(data.nodes);
            this.edges = data.edges || [];
        }
    }

    private saveToStorage(): void {
        const data = {
            nodes: Array.from(this.nodes.entries()),
            edges: this.edges
        };
        this.storage.write(StorageFiles.GRAPH_NODES, data);
    }

    clear(): void {
        this.nodes.clear();
        this.edges = [];
        this.storage.delete(StorageFiles.GRAPH_NODES);
    }
}
