import * as vscode from 'vscode';
import { ImmediateContext } from '../memory/layers/immediateContext';
import { SessionGraph } from '../memory/layers/sessionGraph';
import { KeywordSearch } from '../memory/retrieval/keywordSearch';
import { EntityExtractor } from '../memory/extraction/entityExtractor';
import { ObjectiveTracker } from '../persistence/objectiveTracker';
import { HighlightExtractor } from '../persistence/highlightExtractor';
import { ConversationSaver } from '../persistence/conversationSaver';
import { TokenBudget } from './tokenBudget';
import { ChatPanel } from '../ui/chatPanel';
import { BaseModelAdapter, ModelAdapterFactory, ChatMessage, ModelConfig } from '../adapters/base';
import { FileStorage, StorageFiles } from '../storage/fileStorage';

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
    private keywordSearch: KeywordSearch;
    private entityExtractor: EntityExtractor;

    // Persistence
    private objectiveTracker: ObjectiveTracker;
    private highlightExtractor: HighlightExtractor;
    private conversationSaver: ConversationSaver;
    private storage: FileStorage;

    // Utilities
    private tokenBudget: TokenBudget;

    // State
    private currentModel: string = 'claude';
    private currentAdapter: BaseModelAdapter | null = null;
    private messages: Message[] = [];
    private chatPanel: ChatPanel | null = null;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.storage = new FileStorage(context);

        // Initialize memory layers
        this.immediateContext = new ImmediateContext();
        this.sessionGraph = new SessionGraph(context);
        this.keywordSearch = new KeywordSearch(context);
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
     * Switch to a different AI model with enhanced context preservation
     */
    async switchModel(newModel: string): Promise<void> {
        const previousModel = this.currentModel;

        if (previousModel === newModel) return;

        // Generate comprehensive context handoff
        const handoff = await this.generateContextHandoff(newModel);

        // Switch adapter
        this.currentModel = newModel;
        this.initializeAdapter(newModel);

        // Update UI
        if (this.chatPanel) {
            this.chatPanel.setCurrentModel(newModel);
        }

        vscode.window.showInformationMessage(
            `🌟 Switched to ${newModel}. North Star context injected (${handoff.tokenCount} tokens).`
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
        this.keywordSearch.addMessage(userMessage);

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
            this.keywordSearch.addMessage(assistantMessage);

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

        // Get persistent context handoff
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
     * Generate enhanced context handoff for model switch or session resume
     */
    async generateContextHandoff(targetModel: string): Promise<{ context: string; tokenCount: number }> {
        const budget = this.tokenBudget.getBudgetForModel(targetModel);
        let context = `# North Star Context 🌟\n\n`;
        context += `You are taking over an existing session. Here is the full context summary to ensure seamless continuity.\n\n`;

        // 1. North Star Objectives (The "Why")
        const objectives = this.objectiveTracker.getCurrentObjectives();
        if (objectives.length > 0) {
            context += `## 🎯 Current Objectives\n`;
            context += objectives.map(o => `- ${o.status === 'completed' ? '✓' : '○'} ${o.statement}`).join('\n');
            context += '\n\n';
        }

        // 2. Key Highlights (Decisions, Blockers, Milestones)
        const highlightsContext = this.highlightExtractor.getHighlightsForContext();
        if (highlightsContext) {
            context += highlightsContext + '\n';
        }

        // 3. Knowledge Graph Summary (The "What")
        const intents = this.sessionGraph.getIntents();
        const decisions = this.sessionGraph.getDecisions();
        if (intents.length > 0 || decisions.length > 0) {
            context += `## 🧠 Session Knowledge Graph\n`;
            if (intents.length > 0) context += `### Intents\n${intents.slice(-3).map(i => `- ${i.content}`).join('\n')}\n`;
            if (decisions.length > 0) context += `### Key Decisions\n${decisions.slice(-5).map(d => `- ${d.content}`).join('\n')}\n`;
            context += '\n';
        }

        // 4. Relevant History (Keyword Search)
        // Find messages related to current objective or recent topics
        const query = objectives[0]?.statement || this.immediateContext.getContext().slice(0, 50);
        if (query) {
            const results = this.keywordSearch.search(query, 3);
            if (results.length > 0) {
                context += `## 🔍 Relevant History\n`;
                context += results.map(r => `> ${r.content.substring(0, 150)}...`).join('\n');
                context += '\n\n';
            }
        }

        // 5. Immediate Context Summary
        const immediate = this.immediateContext.getContext();
        if (immediate) {
            context += `## 💬 Recent Conversation Summary\n(Last 5 messages)\n${immediate}\n\n`;
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

    showObjectivesPanel(): void {
        const objectives = this.objectiveTracker.getAllObjectives();
        const items = objectives.map(o => ({
            label: `${o.status === 'completed' ? '✓' : '○'} ${o.statement}`,
            description: o.status
        }));
        vscode.window.showQuickPick(items, { placeHolder: 'Current Objectives' });
    }

    async exportSessionToMarkdown(): Promise<void> {
        await this.conversationSaver.exportToMarkdown(
            this.messages,
            this.objectiveTracker.getAllObjectives()
        );
    }

    saveCurrentSession(): void {
        this.conversationSaver.autoSave(this.messages);
    }

    private loadMessages(): void {
        const data = this.storage.read<{ messages: Message[] }>(StorageFiles.SESSION_STATE, { messages: [] });
        if (data && data.messages) {
            this.messages = data.messages;
            for (const msg of data.messages.slice(-5)) {
                this.immediateContext.addMessage(msg);
            }
        }
    }

    private saveMessages(): void {
        // Keep only last 100 messages in storage
        const toSave = this.messages.slice(-100);
        this.storage.write(StorageFiles.SESSION_STATE, { messages: toSave });
    }
}
