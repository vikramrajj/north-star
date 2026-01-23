import * as vscode from 'vscode';
import { ImmediateContext } from '../memory/layers/immediateContext';
import { SessionGraph } from '../memory/layers/sessionGraph';
import { VectorStore } from '../memory/layers/vectorStore';
import { HybridRetriever } from '../memory/retrieval/hybridRetriever';
import { EntityExtractor } from '../memory/extraction/entityExtractor';
import { ObjectiveTracker } from '../persistence/objectiveTracker';
import { HighlightExtractor } from '../persistence/highlightExtractor';
import { ConversationSaver } from '../persistence/conversationSaver';
import { TokenBudget } from './tokenBudget';
import { ChatPanel } from '../ui/chatPanel';
import { BaseModelAdapter, ModelAdapterFactory, ChatMessage, ModelConfig } from '../adapters/base';

// Import adapters to register them
import '../adapters/claude';
import '../adapters/gemini';
import '../adapters/openai';

export interface Message {
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    model?: string;
}

/**
 * Main orchestrator for the North Star extension
 * Coordinates all memory layers, adapters, and persistence
 */
export class ContextBridge {
    private context: vscode.ExtensionContext;

    // Memory layers
    private immediateContext: ImmediateContext;
    private sessionGraph: SessionGraph;
    private vectorStore: VectorStore;
    private hybridRetriever: HybridRetriever;
    private entityExtractor: EntityExtractor;

    // Persistence
    private objectiveTracker: ObjectiveTracker;
    private highlightExtractor: HighlightExtractor;
    private conversationSaver: ConversationSaver;

    // Utilities
    private tokenBudget: TokenBudget;

    // State
    private currentModel: string = 'claude';
    private currentAdapter: BaseModelAdapter | null = null;
    private messages: Message[] = [];
    private chatPanel: ChatPanel | null = null;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;

        // Initialize memory layers
        this.immediateContext = new ImmediateContext();
        this.sessionGraph = new SessionGraph(context);
        this.vectorStore = new VectorStore(context);
        this.hybridRetriever = new HybridRetriever(this.sessionGraph, this.vectorStore);
        this.entityExtractor = new EntityExtractor(this.sessionGraph);

        // Initialize persistence
        this.objectiveTracker = new ObjectiveTracker(context);
        this.highlightExtractor = new HighlightExtractor(context);
        this.conversationSaver = new ConversationSaver(context);

        // Initialize utilities
        this.tokenBudget = new TokenBudget();

        // Load saved messages if any
        this.loadMessages();

        // Initialize default adapter
        this.initializeAdapter(this.currentModel);
    }

    /**
     * Initialize model adapter with API key from settings
     */
    private initializeAdapter(model: string): void {
        const config = vscode.workspace.getConfiguration('northStar');
        const apiKey = config.get<string>(`${model}ApiKey`) || '';

        if (!apiKey) {
            vscode.window.showWarningMessage(
                `No API key configured for ${model}. Set it in settings: northStar.${model}ApiKey`
            );
        }

        const adapterConfig: ModelConfig = {
            apiKey,
            model: config.get<string>(`${model}Model`)
        };

        this.currentAdapter = ModelAdapterFactory.create(model, adapterConfig);
    }

    /**
     * Switch to a different AI model with context preservation
     */
    async switchModel(newModel: string): Promise<void> {
        const previousModel = this.currentModel;

        if (previousModel === newModel) return;

        // Generate context handoff before switching
        const handoff = await this.generateContextHandoff(newModel);

        // Switch adapter
        this.currentModel = newModel;
        this.initializeAdapter(newModel);

        // Update UI
        if (this.chatPanel) {
            this.chatPanel.setCurrentModel(newModel);
        }

        vscode.window.showInformationMessage(
            `🌟 Switched from ${previousModel} to ${newModel}. Context preserved (${handoff.tokenCount} tokens).`
        );
    }

    /**
     * Send a message to the current model
     */
    async sendMessage(content: string): Promise<void> {
        if (!this.currentAdapter) {
            vscode.window.showErrorMessage('No model adapter available. Check API key settings.');
            return;
        }

        // Add user message
        const userMessage: Message = {
            role: 'user',
            content,
            timestamp: new Date(),
            model: this.currentModel
        };
        this.addMessage(userMessage);

        // Extract entities and highlights from user message
        this.entityExtractor.processMessage(content);
        this.highlightExtractor.extractFromMessage(content, this.messages.length - 1);
        this.objectiveTracker.extractFromMessage(content);

        // Add to vector store for semantic search
        await this.vectorStore.add(
            `msg_${Date.now()}`,
            content,
            { role: 'user', model: this.currentModel }
        );

        try {
            // Build context-aware messages
            const contextMessages = await this.buildContextMessages(content);

            // Send to model
            const response = await this.currentAdapter.sendMessage(contextMessages);

            // Add assistant message
            const assistantMessage: Message = {
                role: 'assistant',
                content: response.content,
                timestamp: new Date(),
                model: this.currentModel
            };
            this.addMessage(assistantMessage);

            // Extract from response
            this.entityExtractor.processMessage(response.content);
            this.highlightExtractor.extractFromMessage(response.content, this.messages.length - 1);

            // Add to vector store
            await this.vectorStore.add(
                `msg_${Date.now()}`,
                response.content,
                { role: 'assistant', model: this.currentModel }
            );

            // Update UI
            this.updateUI();

        } catch (error) {
            vscode.window.showErrorMessage(`Error: ${error}`);
        }
    }

    /**
     * Build context-aware message list for the model
     */
    private async buildContextMessages(currentMessage: string): Promise<ChatMessage[]> {
        const messages: ChatMessage[] = [];

        // Get context handoff
        const handoff = await this.generateContextHandoff(this.currentModel);

        // Add system message with context
        if (handoff.context) {
            messages.push({
                role: 'system',
                content: handoff.context
            });
        }

        // Add recent conversation
        const recentMessages = this.messages.slice(-10);
        for (const msg of recentMessages) {
            messages.push({
                role: msg.role,
                content: msg.content
            });
        }

        return messages;
    }

    /**
     * Generate context for model switch or session resume
     */
    async generateContextHandoff(targetModel: string): Promise<{ context: string; tokenCount: number }> {
        const budget = this.tokenBudget.getBudgetForModel(targetModel);
        const allocation = this.tokenBudget.getAllocation(targetModel);

        let context = `# North Star Context\n\n`;

        // Objectives (always included)
        const objectives = this.objectiveTracker.getCurrentObjectives();
        if (objectives.length > 0) {
            context += `## Current Objectives\n`;
            context += objectives.map(o => `- ${o.status === 'completed' ? '✓' : '○'} ${o.statement}`).join('\n');
            context += '\n\n';
        }

        // Highlights
        const highlightsContext = this.highlightExtractor.getHighlightsForContext();
        if (highlightsContext) {
            context += highlightsContext + '\n';
        }

        // Immediate context
        const immediate = this.immediateContext.getContext();
        if (immediate) {
            context += `## Recent Conversation\n${immediate}\n\n`;
        }

        // Hybrid RAG retrieval for remaining budget
        const remaining = budget - this.tokenBudget.countTokens(context);
        if (remaining > 0) {
            const lastUserMessage = this.messages.filter(m => m.role === 'user').pop();
            if (lastUserMessage) {
                const retrieved = await this.hybridRetriever.retrieve(lastUserMessage.content, remaining);
                if (retrieved) {
                    context += `## Related Context\n${retrieved}\n`;
                }
            }
        }

        return {
            context,
            tokenCount: this.tokenBudget.countTokens(context)
        };
    }

    /**
     * Add a message and update immediate context
     */
    private addMessage(message: Message): void {
        this.messages.push(message);
        this.immediateContext.addMessage(message);
        this.saveMessages();

        if (this.chatPanel) {
            this.chatPanel.addMessage(message);
        }
    }

    /**
     * Update UI with current state
     */
    private updateUI(): void {
        if (this.chatPanel) {
            this.chatPanel.updateObjectives(this.objectiveTracker.getAllObjectives());
            this.chatPanel.updateHighlights(this.highlightExtractor.getAllHighlights());
        }
    }

    /**
     * Open the chat panel
     */
    openChatPanel(): void {
        this.chatPanel = ChatPanel.createOrShow(this.context.extensionUri);

        // Set up callbacks
        this.chatPanel.onMessage((message) => {
            this.sendMessage(message);
        });

        this.chatPanel.onModelSwitch((model) => {
            this.switchModel(model);
        });

        // Initial state
        this.chatPanel.setCurrentModel(this.currentModel);
        this.chatPanel.updateObjectives(this.objectiveTracker.getAllObjectives());
        this.chatPanel.updateHighlights(this.highlightExtractor.getAllHighlights());

        // Load existing messages
        for (const msg of this.messages) {
            this.chatPanel.addMessage(msg);
        }
    }

    /**
     * Show objectives panel
     */
    showObjectivesPanel(): void {
        const objectives = this.objectiveTracker.getAllObjectives();

        if (objectives.length === 0) {
            vscode.window.showInformationMessage('No objectives tracked yet. Start a conversation!');
            return;
        }

        const items = objectives.map(o => ({
            label: `${o.status === 'completed' ? '✓' : o.status === 'blocked' ? '⚠' : '○'} ${o.statement}`,
            description: o.status
        }));

        vscode.window.showQuickPick(items, {
            placeHolder: 'Current Objectives'
        });
    }

    /**
     * Export session to markdown
     */
    async exportSessionToMarkdown(): Promise<void> {
        await this.conversationSaver.exportToMarkdown(
            this.messages,
            this.objectiveTracker.getAllObjectives()
        );
    }

    /**
     * Save current session
     */
    saveCurrentSession(): void {
        this.conversationSaver.autoSave(this.messages);
    }

    /**
     * Persistence helpers
     */
    private loadMessages(): void {
        const saved = this.context.globalState.get<Message[]>('messages');
        if (saved) {
            this.messages = saved;
            for (const msg of saved) {
                this.immediateContext.addMessage(msg);
            }
        }
    }

    private saveMessages(): void {
        // Keep only last 100 messages in storage
        const toSave = this.messages.slice(-100);
        this.context.globalState.update('messages', toSave);
    }
}
