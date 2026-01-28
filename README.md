# North Star 🌟

**Persistent Memory Extension for VS Code** — Seamless context preservation across AI model switches, session disconnects, and IDE restarts.

## Problem

When using AI coding assistants, context is lost when:
- Switching between models (Claude ↔ Gemini ↔ GPT)
- IDE restarts or session disconnects
- Long conversations exceed token limits

**North Star** keeps your objectives and key decisions visible, using a **Hybrid RAG** approach to intelligently retrieve relevant context.

## Features

- 🎯 **Objective Tracking** — Main goals always in focus
- 📌 **Highlight System** — Auto-detects decisions, blockers, solutions
- 🔄 **Model Switching** — Seamless context handoff between providers
- 💾 **Session Persistence** — Resume conversations after IDE restart
- 🧠 **Hybrid RAG** — Graph + Vector retrieval for intelligent context

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   North Star Core                   │
├─────────────────────────────────────────────────────┤
│  Layer 1: Immediate Context (last 5 messages)       │
│  Layer 2: Session Graph (entities + relationships)  │
│  Layer 3: Vector Store (semantic search)            │
│  Layer 4: Persistent KB (cross-session memory)      │
└─────────────────────────────────────────────────────┘
```

## Installation

1. Install via VS Code Marketplace: Search for **"North Star"**.
2. Or install manually:
   - Download the `.vsix` file from Releases.
   - Run `code --install-extension north-star-0.1.0.vsix`

## Setup

1. Open VS Code Settings (`Ctrl+,`).
2. Search for `northStar`.
3. Add API Keys for your preferred providers:
   - `northStar.claudeApiKey`
   - `northStar.geminiApiKey`
   - `northStar.openaiApiKey`

## Usage

1. **Open Chat**: Click the star icon in the Activity Bar or run command `North Star: Open Chat Panel`.
2. **Set Objective**: Start chatting or manually set a goal.
3. **Switch Model**: Click the model name (e.g., "Claude") to switch to Gemini/GPT. Context is preserved automatically!

## License

MIT
