import * as vscode from 'vscode';

/**
 * Handles session recovery on IDE restart
 */
export class SessionRecovery {
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    /**
     * Check if there's a previous session to recover
     */
    async checkForPreviousSession(): Promise<void> {
        const lastSession = this.context.globalState.get<any>('lastSession');

        if (lastSession && lastSession.messages?.length > 0) {
            const timeSinceLastSave = Date.now() - new Date(lastSession.lastSaved).getTime();
            const hoursSinceLastSave = timeSinceLastSave / (1000 * 60 * 60);

            // Only prompt if session is less than 24 hours old
            if (hoursSinceLastSave < 24) {
                await this.promptResumeSession();
            }
        }
    }

    /**
     * Prompt user to resume previous session
     */
    async promptResumeSession(): Promise<void> {
        const lastSession = this.context.globalState.get<any>('lastSession');
        if (!lastSession) {
            vscode.window.showInformationMessage('No previous session found');
            return;
        }

        const messageCount = lastSession.messages?.length || 0;
        const lastSaved = new Date(lastSession.lastSaved).toLocaleString();

        const choice = await vscode.window.showInformationMessage(
            `Resume previous session? (${messageCount} messages, last saved ${lastSaved})`,
            'Resume',
            'Start Fresh'
        );

        if (choice === 'Resume') {
            await this.restoreSession(lastSession);
            vscode.window.showInformationMessage('Session restored! 🌟');
        } else if (choice === 'Start Fresh') {
            this.context.globalState.update('lastSession', undefined);
        }
    }

    private async restoreSession(sessionData: any): Promise<void> {
        // Restore context to global state for ContextBridge to pick up
        // The ContextBridge will load this on initialization
        this.context.globalState.update('restoredSession', sessionData);
    }

    /**
     * Generate recovery context for injection into new model
     */
    getRecoveryContext(): string | null {
        const lastSession = this.context.globalState.get<any>('lastSession');
        if (!lastSession) return null;

        const objectives = lastSession.objectives || [];
        const messages = lastSession.messages || [];
        const recentMessages = messages.slice(-5);

        return `# Session Recovery

## Main Objective
${objectives[0]?.statement || 'No objective recorded'}

## Current Status
${objectives.filter((o: any) => o.status === 'active').map((o: any) => `- ${o.statement}`).join('\n') || 'No active objectives'}

## Recent Conversation
${recentMessages.map((m: any) => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n')}

---
*Restored by North Star*`;
    }
}
