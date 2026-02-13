import { env, pipeline } from '@xenova/transformers';
import * as vscode from 'vscode';

// Configure transformers to use local cache
// env.cacheDir is set in initialize()
env.allowLocalModels = false; // Allow downloading from HF Hub first time

/**
 * Singleton class for Local Embedding Model
 * Uses all-MiniLM-L6-v2 via ONNX runtime
 */
export class LocalEmbeddingModel {
    private static instance: LocalEmbeddingModel;
    private extractor: any = null;
    private modelName: string = 'Xenova/all-MiniLM-L6-v2';
    private isInitializing: boolean = false;

    private constructor() { }

    static getInstance(): LocalEmbeddingModel {
        if (!LocalEmbeddingModel.instance) {
            LocalEmbeddingModel.instance = new LocalEmbeddingModel();
        }
        return LocalEmbeddingModel.instance;
    }

    /**
     * Initialize the model pipeline
     */
    async initialize(cacheDir?: string): Promise<void> {
        if (this.extractor || this.isInitializing) return;

        this.isInitializing = true;
        try {
            if (cacheDir) {
                env.cacheDir = cacheDir;
            }

            // Use feature-extraction pipeline
            this.extractor = await pipeline('feature-extraction', this.modelName, {
                quantized: true // Use int8 quantization for speed/size
            });
            console.log('🌟 Local embedding model initialized:', this.modelName);
        } catch (error) {
            console.error('Failed to initialize local embedding model:', error);
            vscode.window.showErrorMessage('North Star: Failed to load local embedding model.');
        } finally {
            this.isInitializing = false;
        }
    }

    /**
     * Generate embedding for text
     * Returns 384-dimensional vector
     */
    async generate(text: string): Promise<number[]> {
        if (!this.extractor) {
            await this.initialize();
        }

        if (!this.extractor) {
            throw new Error('Embedding model not initialized');
        }

        // Generate embedding
        // pooling: 'mean' averages token embeddings to get sentence embedding
        // normalize: true ensures cosine similarity works directly with dot product
        const output = await this.extractor(text, { pooling: 'mean', normalize: true });

        // Convert Tensor to standard array
        return Array.from(output.data);
    }
}
