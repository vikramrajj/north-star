import * as vscode from 'vscode';
import { ContextBridge } from './core/contextBridge';
import { SessionRecovery } from './persistence/sessionRecovery';

let contextBridge: ContextBridge;

export async function activate(context: vscode.ExtensionContext) {
    console.log('North Star is now active!');

    // Initialize core components
    contextBridge = new ContextBridge(context);

    // Check for session recovery on startup
    const sessionRecovery = new SessionRecovery(context);
    await sessionRecovery.checkForPreviousSession();

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('northStar.openChat', () => {
            contextBridge.openChatPanel();
        }),

        vscode.commands.registerCommand('northStar.switchModel', async () => {
            const models = ['claude', 'gemini', 'openai'];
            const selected = await vscode.window.showQuickPick(models, {
                placeHolder: 'Select AI Model'
            });
            if (selected) {
                await contextBridge.switchModel(selected);
            }
        }),

        vscode.commands.registerCommand('northStar.viewObjectives', () => {
            contextBridge.showObjectivesPanel();
        }),

        vscode.commands.registerCommand('northStar.exportSession', async () => {
            await contextBridge.exportSessionToMarkdown();
        }),

        vscode.commands.registerCommand('northStar.resumeSession', async () => {
            await sessionRecovery.promptResumeSession();
        })
    );
}

export function deactivate() {
    if (contextBridge) {
        contextBridge.saveCurrentSession();
    }
}
