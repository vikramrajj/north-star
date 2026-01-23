import * as vscode from 'vscode';
import { ImmediateContext } from '../memory/layers/immediateContext';
import { SessionGraph } from '../memory/layers/sessionGraph';
import { VectorStore } from '../memory/layers/vectorStore';
import { HybridRetriever } from '../memory/retrieval/hybridRetriever';
import { ObjectiveTracker } from '../persistence/objectiveTracker';
import { ConversationSaver } from '../persistence/conversationSaver';
import { TokenBudget } from './tokenBudget';

export interface Message {
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    model?: string;
}

export class ContextBridge {
    private context: vscode.ExtensionContext;
    private immediateContext: ImmediateContext;
    private sessionGraph: SessionGraph;
    private vectorStore: VectorStore;
    private hybridRetriever: HybridRetriever;
    private objectiveTracker: ObjectiveTracker;
    private conversationSaver: ConversationSaver;
    private tokenBudget: TokenBudget;
    private currentModel: string = 'claude';
    private messages: Message[] = [];

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.immediateContext = new ImmediateContext();
        this.sessionGraph = new SessionGraph(context);
        this.vectorStore = new VectorStore(context);
        this.hybridRetriever = new HybridRetriever(this.sessionGraph, this.vectorStore);
        this.objectiveTracker = new ObjectiveTracker(context);
        this.conversationSaver = new ConversationSaver(context);
        this.tokenBudget = new TokenBudget();
    }

    /**
     * Switch to a different AI model with context preservation
     */
    async switchModel(newModel: string): Promise<void> {
        const previousModel = this.currentModel;
        this.currentModel = newModel;

        // Generate context handoff
        const contextHandoff = await this.generateContextHandoff(newModel);

        vscode.window.showInformationMessage(
            `Switched from ${previousModel} to ${newModel}. Context preserved (${contextHandoff.tokenCount} tokens).`
        );
    }

    /**
     * Generate context for model switch using hybrid RAG
     */
    async generateContextHandoff(targetModel: string): Promise<{ context: string; tokenCount: number }> {
        const budget = this.tokenBudget.getBudgetForModel(targetModel);

        // Layer 1: Always include immediate context
        const immediate = this.immediateContext.getContext();
        let remaining = budget - this.tokenBudget.countTokens(immediate);

        // Get current objective
        const objectives = this.objectiveTracker.getCurrentObjectives();
        const objectiveText = this.formatObjectives(objectives);
        remaining -= this.tokenBudget.countTokens(objectiveText);

        // Layer 2 + 3: Hybrid retrieval
        const retrievedContext = await this.hybridRetriever.retrieve(
            this.getCurrentQuery(),
            remaining
        );

        const fullContext = this.assembleContext(objectiveText, immediate, retrievedContext);

        return {
            context: fullContext,
            tokenCount: this.tokenBudget.countTokens(fullContext)
        };
    }

    /**
     * Assemble final context from all layers
     */
    private assembleContext(objectives: string, immediate: string, retrieved: string): string {
        return `# Session Context

## Current Objectives
${objectives}

## Recent Conversation
${immediate}

## Relevant Context
${retrieved}

---
*Context preserved by North Star*`;
    }

    private formatObjectives(objectives: any[]): string {
        return objectives.map(o => `- ${o.status === 'completed' ? '✓' : '○'} ${o.statement}`).join('\n');
    }

    private getCurrentQuery(): string {
        const lastUserMessage = this.messages.filter(m => m.role === 'user').pop();
        return lastUserMessage?.content || '';
    }

    openChatPanel(): void {
        // TODO: Implement webview panel
        vscode.window.showInformationMessage('North Star Chat Panel (Coming Soon)');
    }

    showObjectivesPanel(): void {
        // TODO: Implement objectives view
        vscode.window.showInformationMessage('Objectives Panel (Coming Soon)');
    }

    async exportSessionToMarkdown(): Promise<void> {
        await this.conversationSaver.exportToMarkdown(this.messages, this.objectiveTracker.getCurrentObjectives());
    }

    saveCurrentSession(): void {
        this.conversationSaver.autoSave(this.messages);
    }
}
