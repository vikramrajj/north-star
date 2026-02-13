import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * JSON File Storage System
 * Provides persistent storage using JSON files in the workspace or global location.
 * Cross-IDE compatible (no native dependencies).
 * Features atomic writes and corruption handling.
 */
export class FileStorage {
    private storageDir: string;
    private cache: Map<string, any> = new Map();

    constructor(context: vscode.ExtensionContext) {
        // Use workspace folder if available, otherwise global storage
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

        if (workspaceRoot) {
            this.storageDir = path.join(workspaceRoot, '.north-star');
        } else {
            // Fall back to global storage location
            this.storageDir = path.join(context.globalStorageUri.fsPath, 'data');
        }

        // Ensure directory exists synchronously only in constructor
        this.ensureDirectorySync(this.storageDir);
    }

    /**
     * Get storage directory path
     */
    getStorageDir(): string {
        return this.storageDir;
    }

    /**
     * Read a JSON file with corruption handling (Async & Immutable)
     */
    async read<T>(filename: string, defaultValue: T): Promise<T> {
        // Check cache first
        if (this.cache.has(filename)) {
            // Return a DEEP COPY to ensure immutability
            return JSON.parse(JSON.stringify(this.cache.get(filename)));
        }

        const filePath = path.join(this.storageDir, filename);

        try {
            try {
                await fs.promises.access(filePath);
            } catch {
                return defaultValue;
            }

            const data = await fs.promises.readFile(filePath, 'utf-8');
            try {
                const parsed = JSON.parse(data);
                this.cache.set(filename, parsed);
                return JSON.parse(JSON.stringify(parsed));
            } catch (parseError) {
                console.error(`Error parsing ${filename}. Backing up corrupted file.`, parseError);
                // Backup corrupted file
                try {
                    const backupPath = `${filePath}.corrupt-${Date.now()}`;
                    await fs.promises.copyFile(filePath, backupPath);
                    console.log(`Backed up corrupted file to ${backupPath}`);
                } catch { }

                return defaultValue;
            }
        } catch (error) {
            console.error(`Error reading ${filename}:`, error);
        }

        return defaultValue;
    }

    /**
     * Write to a JSON file (Atomic Write, Async)
     */
    async write<T>(filename: string, data: T): Promise<void> {
        const filePath = path.join(this.storageDir, filename);
        const tempPath = `${filePath}.tmp-${Date.now()}`;

        try {
            await this.ensureDirectoryAsync(path.dirname(filePath));

            // Update cache immediately
            // Store a copy to prevent external mutation affecting cache
            this.cache.set(filename, JSON.parse(JSON.stringify(data)));

            // Atomic write: write to temp, then rename
            await fs.promises.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');

            // Rename temp file to actual file (atomic operation on most OSs)
            await fs.promises.rename(tempPath, filePath);

        } catch (error) {
            console.error(`Error writing ${filename}:`, error);
            // Clean up temp file if it exists
            try {
                await fs.promises.unlink(tempPath);
            } catch { }
        }
    }

    /**
     * Append to an array in a JSON file
     */
    async append<T>(filename: string, item: T): Promise<void> {
        const existing = await this.read<T[]>(filename, []);
        existing.push(item);
        await this.write(filename, existing);
    }

    /**
     * Update specific fields in a JSON file
     */
    async update<T extends object>(filename: string, updates: Partial<T>): Promise<void> {
        const existing = await this.read<T>(filename, {} as T);
        const merged = { ...existing, ...updates };
        await this.write(filename, merged);
    }

    /**
     * Delete a file
     */
    async delete(filename: string): Promise<void> {
        const filePath = path.join(this.storageDir, filename);

        try {
            try {
                await fs.promises.unlink(filePath);
            } catch { }
            this.cache.delete(filename);
        } catch (error) {
            console.error(`Error deleting ${filename}:`, error);
        }
    }

    /**
     * Check if a file exists
     */
    async exists(filename: string): Promise<boolean> {
        const filePath = path.join(this.storageDir, filename);
        try {
            await fs.promises.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * List all files in storage
     */
    async listFiles(subdir?: string): Promise<string[]> {
        const dir = subdir ? path.join(this.storageDir, subdir) : this.storageDir;

        try {
            const files = await fs.promises.readdir(dir);
            return files.filter(f => f.endsWith('.json'));
        } catch (error) {
            console.error('Error listing files:', error);
        }

        return [];
    }

    /**
     * Clear cache (force re-read from disk)
     */
    clearCache(): void {
        this.cache.clear();
    }

    /**
     * Clear all storage
     */
    async clearAll(): Promise<void> {
        try {
            const files = await fs.promises.readdir(this.storageDir);
            for (const file of files) {
                const filePath = path.join(this.storageDir, file);
                const stat = await fs.promises.stat(filePath);
                if (stat.isFile()) {
                    await fs.promises.unlink(filePath);
                }
            }
            this.cache.clear();
        } catch (error) {
            console.error('Error clearing storage:', error);
        }
    }

    private ensureDirectorySync(dir: string): void {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    private async ensureDirectoryAsync(dir: string): Promise<void> {
        try {
            await fs.promises.mkdir(dir, { recursive: true });
        } catch (err: any) {
            if (err.code !== 'EEXIST') throw err;
        }
    }
}

/**
 * Storage file names
 */
export const StorageFiles = {
    MESSAGES: 'messages.json',
    OBJECTIVES: 'objectives.json',
    HIGHLIGHTS: 'highlights.json',
    GRAPH_NODES: 'graph-nodes.json',
    GRAPH_EDGES: 'graph-edges.json',
    SESSION_STATE: 'session-state.json',
    CONFIG: 'config.json'
} as const;
