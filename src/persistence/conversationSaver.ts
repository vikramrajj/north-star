import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Message } from '../core/contextBridge';
import { Objective } from './objectiveTracker';

/**
 * Saves conversations to both JSON (structured) and Markdown (readable)
 */
export class ConversationSaver {
    private context: vscode.ExtensionContext;
    private sessionDir: string = '';

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        // init must be called
    }

    async initialize(): Promise<void> {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (workspaceRoot) {
            this.sessionDir = path.join(workspaceRoot, '.north-star', 'sessions');
            try {
                await fs.promises.mkdir(this.sessionDir, { recursive: true });
            } catch (err: any) {
                if (err.code !== 'EEXIST') throw err;
            }
        }
    }

    /**
     * Export session to human-readable Markdown
     */
    async exportToMarkdown(messages: Message[], objectives: Objective[]): Promise<void> {
        if (!this.sessionDir) {
            await this.initialize();
            if (!this.sessionDir) {
                vscode.window.showErrorMessage('No workspace open to save export.');
                return;
            }
        }

        const timestamp = new Date().toISOString().split('T')[0];
        const title = objectives[0]?.statement || 'Untitled Session';
        const slugTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);

        const dirname = `${timestamp}_${slugTitle}`;
        const sessionPath = path.join(this.sessionDir, dirname);

        if (!fs.existsSync(sessionPath)) {
            await fs.promises.mkdir(sessionPath, { recursive: true });
        }

        // Generate markdown content
        const markdown = this.generateMarkdown(messages, objectives);
        const mdPath = path.join(sessionPath, 'conversation.md');
        await fs.promises.writeFile(mdPath, markdown);

        // Save structured JSON
        const jsonPath = path.join(sessionPath, 'session.json');
        await fs.promises.writeFile(jsonPath, JSON.stringify({ messages, objectives }, null, 2));

        // Save objectives separately for quick access
        const objPath = path.join(sessionPath, 'objectives.json');
        await fs.promises.writeFile(objPath, JSON.stringify(objectives, null, 2));

        vscode.window.showInformationMessage(`Session exported to ${sessionPath}`);
    }

    private generateMarkdown(messages: Message[], objectives: Objective[]): string {
        const title = objectives[0]?.statement || 'Untitled Session';
        const now = new Date();
        const models = [...new Set(messages.map(m => m.model).filter(Boolean))];

        return `# Session: ${title}
**Started**: ${messages[0]?.timestamp || now.toISOString()} | **Last Active**: ${now.toISOString()}
**Model History**: ${models.join(' → ') || 'N/A'}

## 🎯 Objectives
${objectives.map(o => `- ${o.status === 'completed' ? '[x]' : '[ ]'} ${o.statement}`).join('\n')}

## 📌 Key Decisions
*Auto-extracted decisions will appear here*

## ⚠️ Open Issues
*Unresolved blockers will appear here*

## 💬 Conversation Summary
*AI-generated summary*

---

## Full Conversation Log

${messages.map(m => `### ${m.role.toUpperCase()} (${m.model || 'unknown'})
${m.content}

---`).join('\n\n')}
`;
    }

    /**
     * Auto-save session (called on deactivate or periodic interval)
     */
    autoSave(messages: Message[]): void {
        if (messages.length === 0) return;

        const lastSession = this.context.globalState.get<any>('lastSession') || {};
        this.context.globalState.update('lastSession', {
            ...lastSession,
            messages,
            lastSaved: new Date().toISOString()
        });
    }
}
