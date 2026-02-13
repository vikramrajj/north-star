import * as vscode from 'vscode';
import { Message } from '../core/contextBridge';

/**
 * Sidebar Provider for North Star
 * Implements the WebviewViewProvider to render the chat interface in the sidebar
 */
export class SidebarProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'northStar.chatView';
    private _view?: vscode.WebviewView;
    private _extensionUri: vscode.Uri;

    // Callbacks to communicate with ContextBridge
    private onMessageCallback?: (message: string) => void;
    private onModelSwitchCallback?: (model: string) => void;

    constructor(extensionUri: vscode.Uri) {
        this._extensionUri = extensionUri;
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(data => {
            switch (data.command) {
                case 'sendMessage':
                    if (this.onMessageCallback) {
                        this.onMessageCallback(data.text);
                    }
                    break;
                case 'switchModel':
                    if (this.onModelSwitchCallback) {
                        this.onModelSwitchCallback(data.model);
                    }
                    break;
            }
        });
    }

    public onMessage(callback: (message: string) => void): void {
        this.onMessageCallback = callback;
    }

    public onModelSwitch(callback: (model: string) => void): void {
        this.onModelSwitchCallback = callback;
    }

    // Public methods to update the UI
    public addMessage(message: Message): void {
        if (this._view) {
            this._view.webview.postMessage({
                command: 'addMessage',
                message
            });
        }
    }

    public updateObjectives(objectives: any[]): void {
        if (this._view) {
            this._view.webview.postMessage({
                command: 'updateObjectives',
                objectives
            });
        }
    }

    public updateHighlights(highlights: any[]): void {
        if (this._view) {
            this._view.webview.postMessage({
                command: 'updateHighlights',
                highlights
            });
        }
    }

    public setCurrentModel(model: string): void {
        if (this._view) {
            this._view.webview.postMessage({
                command: 'setModel',
                model
            });
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        // Reuse the same HTML as ChatPanel for consistency
        // In a real refactor, we would extract this to a shared template
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>North Star</title>
    <style>
        :root {
            --bg-primary: var(--vscode-editor-background);
            --bg-secondary: var(--vscode-sideBar-background);
            --bg-tertiary: var(--vscode-input-background);
            --text-primary: var(--vscode-foreground);
            --text-secondary: var(--vscode-descriptionForeground);
            --accent: var(--vscode-button-background);
            --accent-hover: var(--vscode-button-hoverBackground);
            --border: var(--vscode-sideBarSectionHeader-border);
        }

        body {
            font-family: var(--vscode-font-family);
            background-color: var(--bg-secondary);
            color: var(--text-primary);
            height: 100vh;
            display: flex;
            flex-direction: column;
            padding: 0;
            margin: 0;
        }

        /* Adjustments for Sidebar width */
        .sidebar {
            display: none; /* Hide internal sidebar in the sidebar view to save space */
        }

        .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px;
            background-color: var(--bg-secondary);
            border-bottom: 1px solid var(--border);
        }

        .model-selector {
            display: flex;
            gap: 4px;
        }

        .model-btn {
            padding: 4px 8px;
            border: 1px solid transparent;
            background: var(--bg-tertiary);
            color: var(--text-secondary);
            border-radius: 4px;
            cursor: pointer;
            font-size: 10px;
        }

        .model-btn.active {
            background: var(--accent);
            color: var(--vscode-button-foreground);
        }

        .chat-container {
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        .messages {
            flex: 1;
            overflow-y: auto;
            padding: 10px;
        }

        .message {
            margin-bottom: 12px;
            padding: 8px 10px;
            border-radius: 6px;
            font-size: 13px;
        }

        .message.user {
            background-color: var(--accent);
            color: var(--vscode-button-foreground);
            margin-left: 10%;
        }

        .message.assistant {
            background-color: var(--bg-tertiary);
            border: 1px solid var(--border);
            margin-right: 10%;
        }

        .input-container {
            padding: 10px;
            border-top: 1px solid var(--border);
        }

        textarea {
            width: 100%;
            background: var(--bg-tertiary);
            color: var(--text-primary);
            border: 1px solid var(--border);
            padding: 8px;
            border-radius: 4px;
            resize: vertical;
            min-height: 40px;
        }

        button#sendBtn {
            margin-top: 4px;
            width: 100%;
            padding: 6px;
            background: var(--accent);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }
    </style>
</head>
<body>
    <div class="header">
        <span style="font-weight:bold; font-size:12px;">North Star</span>
        <div class="model-selector">
            <button class="model-btn active" data-model="claude">C</button>
            <button class="model-btn" data-model="gemini">G</button>
            <button class="model-btn" data-model="openai">O</button>
        </div>
    </div>

    <!-- We show Objectives/Highlights briefly at top or just rely on the Chat for now in sidebar mode -->
    <div class="chat-container">
        <div class="messages" id="messages">
            <div style="text-align:center; padding:20px; color:var(--text-secondary)">
                <span>🌟</span><br>
                Welcome to North Star
            </div>
        </div>
        <div class="input-container">
            <textarea id="messageInput" placeholder="Ask North Star..."></textarea>
            <button id="sendBtn">Send</button>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let currentModel = 'claude';
        const messagesContainer = document.getElementById('messages');
        const messageInput = document.getElementById('messageInput');
        
        // Model Switch
        document.querySelectorAll('.model-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const model = btn.dataset.model;
                if(model !== currentModel) {
                    document.querySelectorAll('.model-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    currentModel = model;
                    vscode.postMessage({ command: 'switchModel', model });
                }
            });
        });

        // Send Message
        document.getElementById('sendBtn').addEventListener('click', sendMessage);
        messageInput.addEventListener('keydown', (e) => {
            if(e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        function sendMessage() {
            const text = messageInput.value.trim();
            if(text) {
                vscode.postMessage({ command: 'sendMessage', text });
                messageInput.value = '';
            }
        }

        // Handle Incoming
        window.addEventListener('message', event => {
            const data = event.data;
            switch(data.command) {
                case 'addMessage':
                    const div = document.createElement('div');
                    div.className = 'message ' + data.message.role;
                    div.textContent = data.message.content; 
                    messagesContainer.appendChild(div);
                    messagesContainer.scrollTop = messagesContainer.scrollHeight;
                    break;
                case 'setModel':
                    currentModel = data.model;
                    document.querySelectorAll('.model-btn').forEach(b => {
                        b.classList.toggle('active', b.dataset.model === data.model);
                    });
                    break;
            }
        });
    </script>
</body>
</html>`;
    }
}
