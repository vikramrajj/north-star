import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Manages cleaning of old session data
 */
export class SessionCleaner {
    private storageDir: string;
    private maxAgeMs: number;

    constructor(context: vscode.ExtensionContext, maxAgeHours: number = 24) {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (workspaceRoot) {
            this.storageDir = path.join(workspaceRoot, '.north-star', 'sessions');
        } else {
            this.storageDir = path.join(context.globalStorageUri.fsPath, 'data');
        }
        this.maxAgeMs = maxAgeHours * 60 * 60 * 1000;
    }

    /**
     * Purge sessions older than configured age
     */
    async clean(): Promise<void> {
        if (!this.storageDir || !fs.existsSync(this.storageDir)) return;

        try {
            const entries = await fs.promises.readdir(this.storageDir);
            const now = Date.now();

            for (const entry of entries) {
                const entryPath = path.join(this.storageDir, entry);
                try {
                    const stats = await fs.promises.stat(entryPath);
                    const age = now - stats.mtimeMs;

                    if (age > this.maxAgeMs) {
                        // It's old, delete it
                        if (stats.isDirectory()) {
                            await fs.promises.rm(entryPath, { recursive: true, force: true });
                        } else {
                            await fs.promises.unlink(entryPath);
                        }
                        console.log(`[SessionCleaner] Purged old session: ${entry}`);
                    }
                } catch (err) {
                    console.error(`[SessionCleaner] Error processing ${entry}:`, err);
                }
            }
        } catch (error) {
            console.error('[SessionCleaner] Error cleaning sessions:', error);
        }
    }
}
