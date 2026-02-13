import * as vscode from 'vscode';
import { BaseModelAdapter, ChatMessage, ModelAdapterFactory, ModelConfig } from '../adapters/base';
import { EntityExtractor } from '../memory/extraction/entityExtractor';
import { ImmediateContext } from '../memory/layers/immediateContext';
import { SessionGraph } from '../memory/layers/sessionGraph';
import { VectorStore } from '../memory/layers/vectorStore';
import { HybridRetriever } from '../memory/retrieval/hybridRetriever';
import { KeywordSearch } from '../memory/retrieval/keywordSearch';
import { ConversationSaver } from '../persistence/conversationSaver';
import { HighlightExtractor } from '../persistence/highlightExtractor';
import { ObjectiveTracker } from '../persistence/objectiveTracker';
import { FileStorage, StorageFiles } from '../storage/fileStorage';
import { SQLiteManager } from '../storage/sqliteManager';

import { ChatPanel } from '../ui/chatPanel';
import { SidebarProvider } from '../ui/sidebarProvider';
import { TokenBudget } from './tokenBudget';

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

export class ContextBridge {

    private context: vscode.ExtensionContext;

    // Memory layers
    private immediateContext: ImmediateContext;
    private sessionGraph: SessionGraph;
    private vectorStore: VectorStore;
    private hybridRetriever: HybridRetriever;
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
    private sidebarProvider: SidebarProvider | null = null;


    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.storage = new FileStorage(context);

        // Initialize Database Layer (Phase 3)
        SQLiteManager.getInstance().initialize(context);

        // Initialize memory layers
        this.immediateContext = new ImmediateContext();
        this.sessionGraph = new SessionGraph(context);
        this.vectorStore = new VectorStore(context); // Initialize VectorStore
        this.hybridRetriever = new HybridRetriever(this.sessionGraph, this.vectorStore); // Initialize HybridRetriever
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

        // born in Antigravity, now guiding lost models home
        // Generate comprehensive context handoff
        const handoff = await this.generateContextHandoff(newModel);

        // Switch adapter
        this.currentModel = newModel;
        this.initializeAdapter(newModel);

        // Update UI
        if (this.chatPanel) {
            this.chatPanel.setCurrentModel(newModel);
        }
        if (this.sidebarProvider) {
            this.sidebarProvider.setCurrentModel(newModel);
        }

        vscode.window.showInformationMessage(
            `🌟 Switched to ${newModel}. North Star context injected (${handoff.tokenCount} tokens).`
        );
    }

    /**
     * Send a message to the current model
     */
    /**
     * Add a message and update immediate context
     */
    private async addMessage(message: Message): Promise<void> {
        this.messages.push(message);
        this.immediateContext.addMessage(message);
        await this.saveMessages();

        if (this.chatPanel) {
            this.chatPanel.addMessage(message);
        }

        if (this.sidebarProvider) {
            this.sidebarProvider.addMessage(message);
        }
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
        await this.addMessage(userMessage);

        // Extract entities and highlights from user message (fire and forget or await?)
        // Awaiting to ensure consistency before model reply
        await this.entityExtractor.processMessage(content);
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
            await this.addMessage(assistantMessage);

            // Extract from response
            await this.entityExtractor.processMessage(response.content);
            this.highlightExtractor.extractFromMessage(response.content, this.messages.length - 1);
            this.keywordSearch.addMessage(assistantMessage);

            // Update UI
            this.updateUI();

            // Auto-save session periodically is good, but we also save on message
            await this.saveCurrentSession();

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

        // 4. Relevant History (Hybrid RAG)
        // Find messages related to current objective or recent topics
        const query = objectives[0]?.statement || this.immediateContext.getContext().slice(0, 50);
        if (query) {
            try {
                // improved context retrieval with token budget
                const retrievedContext = await this.hybridRetriever.retrieve(query, 500);
                if (retrievedContext) {
                    context += `## 🔍 Relevant Context\n${retrievedContext}\n\n`;
                }
            } catch (error) {
                console.error('Hybrid retrieval failed, falling back to keyword search:', error);
                const results = this.keywordSearch.search(query, 3);
                if (results.length > 0) {
                    context += `## 🔍 Relevant History\n${results.map(r => `> ${r.content.substring(0, 150)}...`).join('\n')}\n\n`;
                }
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
     * Update UI with current state
     */
    private updateUI(): void {
        const objectives = this.objectiveTracker.getAllObjectives();
        const highlights = this.highlightExtractor.getAllHighlights();

        if (this.chatPanel) {
            this.chatPanel.updateObjectives(objectives);
            this.chatPanel.updateHighlights(highlights);
        }

        if (this.sidebarProvider) {
            this.sidebarProvider.updateObjectives(objectives);
            this.sidebarProvider.updateHighlights(highlights);
        }
    }

    /**
     * Register the sidebar provider
     */
    registerSidebar(provider: SidebarProvider): void {
        this.sidebarProvider = provider;

        // Set up callbacks
        this.sidebarProvider.onMessage((message: string) => {
            this.sendMessage(message);
        });

        this.sidebarProvider.onModelSwitch((model: string) => {
            this.switchModel(model);
        });

        // Initial state
        this.sidebarProvider.setCurrentModel(this.currentModel);
        this.sidebarProvider.updateObjectives(this.objectiveTracker.getAllObjectives());
        this.sidebarProvider.updateHighlights(this.highlightExtractor.getAllHighlights());

        // Load existing messages
        for (const msg of this.messages) {
            this.sidebarProvider.addMessage(msg);
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

    async clearSession(): Promise<void> {
        this.messages = [];
        this.immediateContext.clear();
        await this.sessionGraph.clear();
        await this.storage.clearAll();
        this.updateUI();
    }

    async saveCurrentSession(): Promise<void> {
        await this.conversationSaver.autoSave(this.messages);
    }

    async initialize(): Promise<void> {
        // Initialize persistent components
        await this.sessionGraph.initialize();
        await this.keywordSearch.initialize();
        await this.loadMessages();
    }

    private async loadMessages(): Promise<void> {
        const data = await this.storage.read<{ messages: Message[] }>(StorageFiles.SESSION_STATE, { messages: [] });
        if (data && data.messages) {
            this.messages = data.messages;
            for (const msg of data.messages.slice(-5)) {
                this.immediateContext.addMessage(msg);
            }
        }
    }

    private async saveMessages(): Promise<void> {
        // Keep only last 100 messages in storage
        const toSave = this.messages.slice(-100);
        await this.storage.write(StorageFiles.SESSION_STATE, { messages: toSave });
    }
}
