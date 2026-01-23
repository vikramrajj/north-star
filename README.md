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

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/north-star.git

# Install dependencies
cd north-star
npm install

# Build extension
npm run compile
```

## Development

```bash
# Run in development mode
npm run watch

# Run tests
npm run test
```

## License

MIT
