import * as vscode from 'vscode';
import { ContextBridge } from './core/contextBridge';
import { SessionCleaner } from './memory/sessionCleaner';
import { SessionRecovery } from './persistence/sessionRecovery';
import { SidebarProvider } from './ui/sidebarProvider';

let contextBridge: ContextBridge;

export async function activate(context: vscode.ExtensionContext) {
    console.log('🌟 North Star is now active!');

    // 1. Initialize ContextBridge (Sync)
    contextBridge = new ContextBridge(context);

    // 2. Initialize & Register Sidebar (Sync - CRITICAL for "No data provider" fix)
    const sidebarProvider = new SidebarProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(SidebarProvider.viewType, sidebarProvider)
    );
    contextBridge.registerSidebar(sidebarProvider);

    // 3. Initialize Session Recovery (Sync instantiation, Async check)
    const sessionRecovery = new SessionRecovery(context);

    // 4. Perform Async Initialization (Fire & Forget)
    (async () => {
        try {
            await contextBridge.initialize();

            // Check for previous session only after bridge is ready
            await sessionRecovery.checkForPreviousSession();
        } catch (err) {
            console.error('North Star async init failed:', err);
        }
    })();

    // 4. Background Maintenance
    const sessionCleaner = new SessionCleaner(context);
    sessionCleaner.clean().catch(console.error);
    const cleanupInterval = setInterval(() => sessionCleaner.clean().catch(console.error), 60 * 60 * 1000);
    context.subscriptions.push({ dispose: () => clearInterval(cleanupInterval) });

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
                await contextBridge.clearSession();
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
