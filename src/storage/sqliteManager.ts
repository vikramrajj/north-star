import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

/**
 * SQLite Database Manager
 * Handles connection and schema initialization
 */
export class SQLiteManager {
    private static instance: SQLiteManager;
    private db: any | null = null;
    private context: vscode.ExtensionContext | null = null;

    private constructor() { }

    static getInstance(): SQLiteManager {
        if (!SQLiteManager.instance) {
            SQLiteManager.instance = new SQLiteManager();
        }
        return SQLiteManager.instance;
    }

    /**
     * Initialize the database
     */
    initialize(context: vscode.ExtensionContext): void {
        this.context = context;
        if (this.db) return;

        try {
            // Lazy load better-sqlite3 to prevent startup crash if native bindings fail
            let Database;
            try {
                Database = require('better-sqlite3');
            } catch (e) {
                console.error('Failed to load better-sqlite3:', e);
                vscode.window.showErrorMessage('North Star: SQLite native module failed to load. Persistence will be limited to JSON files.');
                return;
            }

            // Use global storage for the database file
            const dbPath = path.join(context.globalStorageUri.fsPath, 'northstar.db');

            // Ensure directory exists
            if (!fs.existsSync(path.dirname(dbPath))) {
                fs.mkdirSync(path.dirname(dbPath), { recursive: true });
            }

            console.log('Using database at:', dbPath);
            this.db = new Database(dbPath);

            // Optimize for performance
            this.db.pragma('journal_mode = WAL');

            this.initializeSchema();

        } catch (error) {
            console.error('Failed to initialize SQLite database:', error);
            vscode.window.showErrorMessage('North Star: Failed to initialize database. Falling back to file storage.');
            // Do not throw, allow extension to continue
        }
    }

    /**
     * Check if database is initialized
     */
    isInitialized(): boolean {
        return this.db !== null;
    }

    /**
     * Get database instance
     */
    getDB(): any {
        if (!this.db) {
            throw new Error('Database not initialized. Call initialize() first.');
        }
        return this.db;
    }

    private initializeSchema(): void {
        if (!this.db) return;

        // Key-Value Store (Migration from JSON files)
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS kv_store (
                key TEXT PRIMARY KEY,
                value TEXT, -- JSON content
                updated_at INTEGER
            );
        `);

        // Graph Nodes
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS graph_nodes (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                content TEXT,
                metadata TEXT, -- JSON
                created_at INTEGER
            );
        `);

        // Graph Edges
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS graph_edges (
                source TEXT,
                target TEXT,
                type TEXT,
                weight REAL,
                created_at INTEGER,
                PRIMARY KEY (source, target, type),
                FOREIGN KEY(source) REFERENCES graph_nodes(id) ON DELETE CASCADE,
                FOREIGN KEY(target) REFERENCES graph_nodes(id) ON DELETE CASCADE
            );
        `);

        // Vector Store
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS vectors (
                id TEXT PRIMARY KEY,
                content TEXT,
                embedding BLOB, -- specific formatting might be needed
                metadata TEXT, -- JSON
                created_at INTEGER
            );
        `);

        console.log('Database schema initialized.');
    }

    close(): void {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
}
