import * as vscode from 'vscode';
import { Message } from '../core/contextBridge';

/**
 * Chat Panel Webview for North Star
 * Cross-IDE compatible (VS Code, Cursor, Windsurf, VSCodium)
 */
export class ChatPanel {
    public static currentPanel: ChatPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    public static readonly viewType = 'northStar.chatPanel';

    private onMessageCallback?: (message: string) => void;
    private onModelSwitchCallback?: (model: string) => void;

    public static createOrShow(extensionUri: vscode.Uri): ChatPanel {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (ChatPanel.currentPanel) {
            ChatPanel.currentPanel._panel.reveal(column);
            return ChatPanel.currentPanel;
        }

        const panel = vscode.window.createWebviewPanel(
            ChatPanel.viewType,
            'North Star',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [extensionUri]
            }
        );

        ChatPanel.currentPanel = new ChatPanel(panel, extensionUri);
        return ChatPanel.currentPanel;
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        this._update();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'sendMessage':
                        if (this.onMessageCallback) {
                            this.onMessageCallback(message.text);
                        }
                        break;
                    case 'switchModel':
                        if (this.onModelSwitchCallback) {
                            this.onModelSwitchCallback(message.model);
                        }
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    public onMessage(callback: (message: string) => void): void {
        this.onMessageCallback = callback;
    }

    public onModelSwitch(callback: (model: string) => void): void {
        this.onModelSwitchCallback = callback;
    }

    public addMessage(message: Message): void {
        this._panel.webview.postMessage({
            command: 'addMessage',
            message
        });
    }

    public updateObjectives(objectives: any[]): void {
        this._panel.webview.postMessage({
            command: 'updateObjectives',
            objectives
        });
    }

    public updateHighlights(highlights: any[]): void {
        this._panel.webview.postMessage({
            command: 'updateHighlights',
            highlights
        });
    }

    public setCurrentModel(model: string): void {
        this._panel.webview.postMessage({
            command: 'setModel',
            model
        });
    }

    public dispose(): void {
        ChatPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private _update(): void {
        this._panel.webview.html = this._getHtmlForWebview();
    }

    private _getHtmlForWebview(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>North Star</title>
    <style>
        :root {
            --bg-primary: #1e1e1e;
            --bg-secondary: #252526;
            --bg-tertiary: #2d2d30;
            --text-primary: #cccccc;
            --text-secondary: #858585;
            --accent: #007acc;
            --accent-hover: #1e90ff;
            --success: #4ec9b0;
            --warning: #dcdcaa;
            --error: #f48771;
            --border: #3c3c3c;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            background-color: var(--bg-primary);
            color: var(--text-primary);
            height: 100vh;
            display: flex;
            flex-direction: column;
        }

        .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 16px;
            background-color: var(--bg-secondary);
            border-bottom: 1px solid var(--border);
        }

        .logo {
            display: flex;
            align-items: center;
            gap: 8px;
            font-weight: 600;
            font-size: 14px;
        }

        .logo-icon {
            font-size: 18px;
        }

        .model-selector {
            display: flex;
            gap: 4px;
        }

        .model-btn {
            padding: 6px 12px;
            border: 1px solid var(--border);
            background: var(--bg-tertiary);
            color: var(--text-secondary);
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            transition: all 0.2s;
        }

        .model-btn:hover {
            border-color: var(--accent);
            color: var(--text-primary);
        }

        .model-btn.active {
            background: var(--accent);
            border-color: var(--accent);
            color: white;
        }

        .main-content {
            display: flex;
            flex: 1;
            overflow: hidden;
        }

        .sidebar {
            width: 240px;
            background-color: var(--bg-secondary);
            border-right: 1px solid var(--border);
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        .sidebar-section {
            padding: 12px;
            border-bottom: 1px solid var(--border);
        }

        .sidebar-title {
            font-size: 11px;
            text-transform: uppercase;
            color: var(--text-secondary);
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .objectives-list, .highlights-list {
            list-style: none;
            font-size: 13px;
        }

        .objectives-list li, .highlights-list li {
            padding: 6px 0;
            border-bottom: 1px solid var(--border);
            display: flex;
            align-items: flex-start;
            gap: 8px;
        }

        .objectives-list li:last-child, .highlights-list li:last-child {
            border-bottom: none;
        }

        .objective-status {
            color: var(--success);
        }

        .highlight-type {
            font-size: 10px;
            padding: 2px 6px;
            border-radius: 3px;
            font-weight: 500;
        }

        .highlight-DECISION { background: #3d5a80; color: #a9d6e5; }
        .highlight-BLOCKER { background: #5a3d3d; color: #f48771; }
        .highlight-SOLUTION { background: #3d5a4a; color: #4ec9b0; }
        .highlight-MILESTONE { background: #5a5a3d; color: #dcdcaa; }

        .chat-container {
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        .messages {
            flex: 1;
            overflow-y: auto;
            padding: 16px;
        }

        .message {
            margin-bottom: 16px;
            padding: 12px 16px;
            border-radius: 8px;
            max-width: 85%;
        }

        .message.user {
            background-color: var(--accent);
            margin-left: auto;
            color: white;
        }

        .message.assistant {
            background-color: var(--bg-tertiary);
            border: 1px solid var(--border);
        }

        .message-role {
            font-size: 11px;
            color: var(--text-secondary);
            margin-bottom: 4px;
            text-transform: uppercase;
        }

        .message.user .message-role {
            color: rgba(255,255,255,0.7);
        }

        .message-content {
            line-height: 1.5;
            white-space: pre-wrap;
        }

        .input-container {
            padding: 16px;
            background-color: var(--bg-secondary);
            border-top: 1px solid var(--border);
        }

        .input-wrapper {
            display: flex;
            gap: 8px;
        }

        #messageInput {
            flex: 1;
            padding: 12px 16px;
            border: 1px solid var(--border);
            background-color: var(--bg-tertiary);
            color: var(--text-primary);
            border-radius: 8px;
            font-size: 14px;
            resize: none;
            min-height: 44px;
            max-height: 200px;
        }

        #messageInput:focus {
            outline: none;
            border-color: var(--accent);
        }

        #sendBtn {
            padding: 12px 20px;
            background-color: var(--accent);
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 500;
            transition: background-color 0.2s;
        }

        #sendBtn:hover {
            background-color: var(--accent-hover);
        }

        .empty-state {
            text-align: center;
            color: var(--text-secondary);
            padding: 40px;
        }

        .empty-state-icon {
            font-size: 48px;
            margin-bottom: 16px;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">
            <span class="logo-icon">🌟</span>
            <span>North Star</span>
        </div>
        <div class="model-selector">
            <button class="model-btn active" data-model="claude">Claude</button>
            <button class="model-btn" data-model="gemini">Gemini</button>
            <button class="model-btn" data-model="openai">GPT</button>
        </div>
    </div>

    <div class="main-content">
        <div class="sidebar">
            <div class="sidebar-section">
                <div class="sidebar-title">🎯 Objectives</div>
                <ul class="objectives-list" id="objectivesList">
                    <li class="empty-state" style="padding: 20px; font-size: 12px;">
                        No objectives yet. Start a conversation!
                    </li>
                </ul>
            </div>
            <div class="sidebar-section">
                <div class="sidebar-title">📌 Highlights</div>
                <ul class="highlights-list" id="highlightsList">
                    <li class="empty-state" style="padding: 20px; font-size: 12px;">
                        Key moments will appear here
                    </li>
                </ul>
            </div>
        </div>

        <div class="chat-container">
            <div class="messages" id="messages">
                <div class="empty-state">
                    <div class="empty-state-icon">🌟</div>
                    <p>Welcome to North Star</p>
                    <p style="margin-top: 8px; font-size: 13px;">
                        Your context persists across model switches and sessions.
                    </p>
                </div>
            </div>

            <div class="input-container">
                <div class="input-wrapper">
                    <textarea 
                        id="messageInput" 
                        placeholder="Type your message..."
                        rows="1"
                    ></textarea>
                    <button id="sendBtn">Send</button>
                </div>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let currentModel = 'claude';
        let messagesContainer = document.getElementById('messages');
        let messageInput = document.getElementById('messageInput');
        let sendBtn = document.getElementById('sendBtn');
        let hasMessages = false;

        // Model selector
        document.querySelectorAll('.model-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const model = btn.dataset.model;
                if (model !== currentModel) {
                    document.querySelectorAll('.model-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    currentModel = model;
                    vscode.postMessage({ command: 'switchModel', model });
                }
            });
        });

        // Send message
        function sendMessage() {
            const text = messageInput.value.trim();
            if (text) {
                vscode.postMessage({ command: 'sendMessage', text });
                messageInput.value = '';
                autoResize();
            }
        }

        sendBtn.addEventListener('click', sendMessage);
        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        // Auto-resize textarea
        function autoResize() {
            messageInput.style.height = 'auto';
            messageInput.style.height = Math.min(messageInput.scrollHeight, 200) + 'px';
        }
        messageInput.addEventListener('input', autoResize);

        // Handle messages from extension
        window.addEventListener('message', event => {
            const data = event.data;
            switch (data.command) {
                case 'addMessage':
                    addMessageToUI(data.message);
                    break;
                case 'updateObjectives':
                    updateObjectivesUI(data.objectives);
                    break;
                case 'updateHighlights':
                    updateHighlightsUI(data.highlights);
                    break;
                case 'setModel':
                    setModelUI(data.model);
                    break;
            }
        });

        function addMessageToUI(message) {
            if (!hasMessages) {
                messagesContainer.innerHTML = '';
                hasMessages = true;
            }

            const div = document.createElement('div');
            div.className = 'message ' + message.role;
            div.innerHTML = \`
                <div class="message-role">\${message.role} (\${message.model || currentModel})</div>
                <div class="message-content">\${escapeHtml(message.content)}</div>
            \`;
            messagesContainer.appendChild(div);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }

        function updateObjectivesUI(objectives) {
            const list = document.getElementById('objectivesList');
            if (objectives.length === 0) {
                list.innerHTML = '<li class="empty-state" style="padding: 20px; font-size: 12px;">No objectives yet</li>';
                return;
            }
            list.innerHTML = objectives.map(o => \`
                <li>
                    <span class="objective-status">\${o.status === 'completed' ? '✓' : '○'}</span>
                    <span>\${escapeHtml(o.statement)}</span>
                </li>
            \`).join('');
        }

        function updateHighlightsUI(highlights) {
            const list = document.getElementById('highlightsList');
            if (highlights.length === 0) {
                list.innerHTML = '<li class="empty-state" style="padding: 20px; font-size: 12px;">Key moments will appear here</li>';
                return;
            }
            list.innerHTML = highlights.slice(-10).map(h => \`
                <li>
                    <span class="highlight-type highlight-\${h.type}">\${h.type}</span>
                    <span>\${escapeHtml(h.content.substring(0, 50))}</span>
                </li>
            \`).join('');
        }

        function setModelUI(model) {
            currentModel = model;
            document.querySelectorAll('.model-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.model === model);
            });
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
    </script>
</body>
</html>`;
    }
}
