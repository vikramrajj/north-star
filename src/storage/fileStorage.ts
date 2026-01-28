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

        this.ensureDirectory(this.storageDir);
    }

    /**
     * Get storage directory path
     */
    getStorageDir(): string {
        return this.storageDir;
    }

    /**
     * Read a JSON file with corruption handling
     */
    read<T>(filename: string, defaultValue: T): T {
        // Check cache first
        if (this.cache.has(filename)) {
            return this.cache.get(filename);
        }

        const filePath = path.join(this.storageDir, filename);

        try {
            if (fs.existsSync(filePath)) {
                const data = fs.readFileSync(filePath, 'utf-8');
                try {
                    const parsed = JSON.parse(data);
                    this.cache.set(filename, parsed);
                    return parsed;
                } catch (parseError) {
                    console.error(`Error parsing ${filename}. Backing up corrupted file.`, parseError);
                    // Backup corrupted file
                    try {
                        const backupPath = `${filePath}.corrupt-${Date.now()}`;
                        fs.copyFileSync(filePath, backupPath);
                        console.log(`Backed up corrupted file to ${backupPath}`);
                    } catch { }

                    return defaultValue;
                }
            }
        } catch (error) {
            console.error(`Error reading ${filename}:`, error);
        }

        return defaultValue;
    }

    /**
     * Write to a JSON file (Atomic Write)
     */
    write<T>(filename: string, data: T): void {
        const filePath = path.join(this.storageDir, filename);
        const tempPath = `${filePath}.tmp-${Date.now()}`;

        try {
            this.ensureDirectory(path.dirname(filePath));

            // Atomic write: write to temp, then rename
            fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');

            // Rename temp file to actual file (atomic operation on most OSs)
            fs.renameSync(tempPath, filePath);

            this.cache.set(filename, data);
        } catch (error) {
            console.error(`Error writing ${filename}:`, error);
            // Clean up temp file if it exists
            if (fs.existsSync(tempPath)) {
                try { fs.unlinkSync(tempPath); } catch { }
            }
        }
    }

    /**
     * Append to an array in a JSON file
     */
    append<T>(filename: string, item: T): void {
        const existing = this.read<T[]>(filename, []);
        existing.push(item);
        this.write(filename, existing);
    }

    /**
     * Update specific fields in a JSON file
     */
    update<T extends object>(filename: string, updates: Partial<T>): void {
        const existing = this.read<T>(filename, {} as T);
        const merged = { ...existing, ...updates };
        this.write(filename, merged);
    }

    /**
     * Delete a file
     */
    delete(filename: string): void {
        const filePath = path.join(this.storageDir, filename);

        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            this.cache.delete(filename);
        } catch (error) {
            console.error(`Error deleting ${filename}:`, error);
        }
    }

    /**
     * Check if a file exists
     */
    exists(filename: string): boolean {
        const filePath = path.join(this.storageDir, filename);
        return fs.existsSync(filePath);
    }

    /**
     * List all files in storage
     */
    listFiles(subdir?: string): string[] {
        const dir = subdir ? path.join(this.storageDir, subdir) : this.storageDir;

        try {
            if (fs.existsSync(dir)) {
                return fs.readdirSync(dir).filter(f => f.endsWith('.json'));
            }
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
    clearAll(): void {
        try {
            if (fs.existsSync(this.storageDir)) {
                const files = fs.readdirSync(this.storageDir);
                for (const file of files) {
                    const filePath = path.join(this.storageDir, file);
                    if (fs.statSync(filePath).isFile()) {
                        fs.unlinkSync(filePath);
                    }
                }
            }
            this.cache.clear();
        } catch (error) {
            console.error('Error clearing storage:', error);
        }
    }

    private ensureDirectory(dir: string): void {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
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
