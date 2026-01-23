import * as vscode from 'vscode';
import { ContextBridge } from './core/contextBridge';
import { SessionRecovery } from './persistence/sessionRecovery';

let contextBridge: ContextBridge;

export async function activate(context: vscode.ExtensionContext) {
    console.log('🌟 North Star is now active!');

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
            const currentModel = vscode.workspace.getConfiguration('northStar').get<string>('defaultModel') || 'claude';

            const selected = await vscode.window.showQuickPick(
                models.map(m => ({
                    label: m.charAt(0).toUpperCase() + m.slice(1),
                    description: m === currentModel ? '(current)' : ''
                })),
                { placeHolder: 'Select AI Model to switch to' }
            );

            if (selected) {
                const model = selected.label.toLowerCase();
                await contextBridge.switchModel(model);
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
        }),

        vscode.commands.registerCommand('northStar.clearSession', async () => {
            const confirm = await vscode.window.showWarningMessage(
                'Clear all session data? This cannot be undone.',
                { modal: true },
                'Clear'
            );

            if (confirm === 'Clear') {
                context.globalState.update('messages', undefined);
                context.globalState.update('objectives', undefined);
                context.globalState.update('highlights', undefined);
                context.globalState.update('sessionGraph', undefined);
                context.globalState.update('vectorStore', undefined);
                vscode.window.showInformationMessage('Session cleared.');
            }
        })
    );

    // Auto-save on interval
    const autoSaveInterval = vscode.workspace.getConfiguration('northStar').get<number>('autoSaveInterval') || 30;
    const autoSaveTimer = setInterval(() => {
        if (contextBridge) {
            contextBridge.saveCurrentSession();
        }
    }, autoSaveInterval * 1000);

    context.subscriptions.push({
        dispose: () => clearInterval(autoSaveTimer)
    });

    // Show getting started message on first activation
    const hasShownWelcome = context.globalState.get<boolean>('hasShownWelcome');
    if (!hasShownWelcome) {
        const action = await vscode.window.showInformationMessage(
            '🌟 Welcome to North Star! Configure your API keys in settings to get started.',
            'Open Settings',
            'Later'
        );

        if (action === 'Open Settings') {
            vscode.commands.executeCommand('workbench.action.openSettings', 'northStar');
        }

        context.globalState.update('hasShownWelcome', true);
    }
}

export function deactivate() {
    if (contextBridge) {
        contextBridge.saveCurrentSession();
    }
    console.log('🌟 North Star deactivated');
}
