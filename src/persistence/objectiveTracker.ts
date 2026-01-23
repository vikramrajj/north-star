import * as vscode from 'vscode';

export interface Objective {
    id: string;
    statement: string;
    status: 'active' | 'completed' | 'blocked';
    subObjectives: Objective[];
    relatedDecisions: string[];
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Tracks main objectives and sub-goals throughout the conversation
 */
export class ObjectiveTracker {
    private objectives: Objective[] = [];
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.loadFromStorage();
    }

    addObjective(statement: string, parentId?: string): Objective {
        const objective: Objective = {
            id: this.generateId(),
            statement,
            status: 'active',
            subObjectives: [],
            relatedDecisions: [],
            createdAt: new Date(),
            updatedAt: new Date()
        };

        if (parentId) {
            const parent = this.findObjective(parentId);
            if (parent) {
                parent.subObjectives.push(objective);
            }
        } else {
            this.objectives.push(objective);
        }

        this.saveToStorage();
        return objective;
    }

    updateStatus(id: string, status: Objective['status']): void {
        const objective = this.findObjective(id);
        if (objective) {
            objective.status = status;
            objective.updatedAt = new Date();
            this.saveToStorage();
        }
    }

    linkDecision(objectiveId: string, decisionId: string): void {
        const objective = this.findObjective(objectiveId);
        if (objective) {
            objective.relatedDecisions.push(decisionId);
            this.saveToStorage();
        }
    }

    getCurrentObjectives(): Objective[] {
        return this.objectives.filter(o => o.status === 'active');
    }

    getAllObjectives(): Objective[] {
        return this.objectives;
    }

    /**
     * Auto-extract objective from user message
     */
    extractFromMessage(message: string): Objective | null {
        const patterns = [
            /i want to (build|create|make|implement|develop) (.+)/i,
            /let's (build|create|make|implement|develop) (.+)/i,
            /goal is to (.+)/i,
            /objective is (.+)/i,
            /need to (.+)/i
        ];

        for (const pattern of patterns) {
            const match = message.match(pattern);
            if (match) {
                const statement = match[2] || match[1];
                return this.addObjective(statement.trim());
            }
        }

        return null;
    }

    private findObjective(id: string, objectives: Objective[] = this.objectives): Objective | null {
        for (const obj of objectives) {
            if (obj.id === id) return obj;
            const found = this.findObjective(id, obj.subObjectives);
            if (found) return found;
        }
        return null;
    }

    private generateId(): string {
        return `obj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private loadFromStorage(): void {
        const stored = this.context.globalState.get<Objective[]>('objectives');
        if (stored) {
            this.objectives = stored;
        }
    }

    private saveToStorage(): void {
        this.context.globalState.update('objectives', this.objectives);
    }

    clear(): void {
        this.objectives = [];
        this.saveToStorage();
    }
}
