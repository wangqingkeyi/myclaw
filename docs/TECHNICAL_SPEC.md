# Personal AI Assistant Framework — Technical Specification

> Version: 0.1.0 | Date: 2026-03-09
>
> A TypeScript framework for building personal AI assistants. Built on top of pi-mono, it provides multi-channel messaging, permission-gated tool execution, group isolation, scheduled tasks, and audit logging — so developers focus on **what the assistant does**, not the plumbing.

---

## Table of Contents

1. [Design Philosophy](#1-design-philosophy)
2. [Architecture Overview](#2-architecture-overview)
3. [Dependency Map — What pi-mono Provides](#3-dependency-map)
4. [Project Structure Conventions](#4-project-structure-conventions)
5. [Module 1: Config Loader](#5-module-1-config-loader)
6. [Module 2: EventBus](#6-module-2-eventbus)
7. [Module 3: Permission Engine](#7-module-3-permission-engine)
8. [Module 4: Tool System](#8-module-4-tool-system)
9. [Module 5: Channel System](#9-module-5-channel-system)
10. [Module 6: Group Manager](#10-module-6-group-manager)
11. [Module 7: Orchestrator](#11-module-7-orchestrator)
12. [Module 8: Storage (SQLite)](#12-module-8-storage)
13. [Module 9: Scheduler](#13-module-9-scheduler)
14. [Module 10: Plugin System](#14-module-10-plugin-system)
15. [Module 11: Container Isolation (Optional)](#15-module-11-container-isolation)
16. [Startup Sequence](#16-startup-sequence)
17. [Message Lifecycle — End-to-End](#17-message-lifecycle)
18. [Session & Memory Model](#18-session-and-memory-model)
19. [Bootstrap & Admin Flow](#19-bootstrap-and-admin-flow)
20. [Error Handling Strategy](#20-error-handling-strategy)
21. [Testing Strategy](#21-testing-strategy)
22. [Implementation Phases](#22-implementation-phases)
23. [Appendix A: Full TypeScript Type Definitions](#appendix-a-full-typescript-type-definitions)
24. [Appendix B: SQLite Schema](#appendix-b-sqlite-schema)
25. [Appendix C: Event Catalog](#appendix-c-event-catalog)
26. [Appendix D: Reference Projects](#appendix-d-reference-projects)

---

## 1. Design Philosophy

### 1.1 Core Principles

| # | Principle | Meaning |
|---|-----------|---------|
| 1 | **Constrain First** | AI can only do what the framework explicitly allows. Every tool call passes through a permission engine. |
| 2 | **Auditable** | Every operation emits an event. Humans can review a complete trail of what the AI did, when, and why. |
| 3 | **Convention over Configuration** | Put a file in `tools/`, it becomes a tool. Put a file in `channels/`, it becomes a channel. No registration boilerplate. |
| 4 | **Leverage, Don't Reinvent** | pi-mono already handles LLM calls, agent loops, tool execution, sessions, and extensions. We only build what it doesn't: multi-channel routing, permissions, group isolation, scheduling. |
| 5 | **Progressive Complexity** | One-line startup for simple cases. Full customization available when needed. |
| 6 | **Human-Readable State** | JSONL sessions, YAML permissions, Markdown memory. All state formats are `cat`-able and `grep`-able. |

### 1.2 What This Framework Is NOT

- **Not a chatbot framework** (no NLU, no intent recognition — the LLM handles that)
- **Not a workflow engine** (no DAGs, no state machines — the agent loop is the workflow)
- **Not a SaaS platform** (single-user, runs on your machine or server)

### 1.3 Analogy

```
Spring Boot : Java Web Applications
    =
This Framework : Personal AI Assistants

Spring Boot provides:            This Framework provides:
  - Dependency injection           - Tool auto-registration
  - Request pipeline               - Message pipeline
  - Security filters               - Permission engine
  - Auto-configuration             - Convention-based scanning
  - Actuator (observability)       - EventBus + audit log
  - Starter dependencies           - pi-mono as the "starter"
```

---

## 2. Architecture Overview

### 2.1 Layer Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                        Application Layer                          │
│                     (Developer-written code)                      │
│                                                                   │
│   config/         channels/       tools/        plugins/          │
│   app.ts          telegram.ts     web-search.ts audit-log.ts      │
│   permissions.yml cli.ts          bash.ts       rate-limit.ts     │
│                   wechat.ts       read.ts       guard.ts          │
│                                                                   │
│   skills/                         groups/                         │
│   code-review/SKILL.md            global/CLAUDE.md                │
│   daily-report/SKILL.md           tg_family/CLAUDE.md             │
│                                   wechat_work/CLAUDE.md           │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│                        Framework Layer                            │
│                     (~1800 lines TypeScript)                      │
│                                                                   │
│   ┌──────────────────────────────────────────────────────────┐   │
│   │                     Orchestrator                          │   │
│   │  Connects channels → permissions → agent → output        │   │
│   └──┬──────────┬──────────┬──────────┬──────────┬───────────┘   │
│      │          │          │          │          │                 │
│   ┌──┴───┐  ┌──┴───┐  ┌──┴───┐  ┌──┴───┐  ┌──┴───┐             │
│   │Chann-│  │Permi-│  │Group │  │Event │  │Sched-│             │
│   │el    │  │ssion │  │Mana- │  │Bus   │  │uler  │             │
│   │Regis-│  │Engi- │  │ger   │  │      │  │      │             │
│   │try   │  │ne    │  │      │  │      │  │      │             │
│   └──────┘  └──────┘  └──────┘  └──────┘  └──────┘             │
│                                                                   │
│   ┌──────────────────────────────────────────────────────────┐   │
│   │                Storage (SQLite)                           │   │
│   │   messages │ groups │ tasks │ state │ audit_log           │   │
│   └──────────────────────────────────────────────────────────┘   │
│                                                                   │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│                     pi-mono Layer (npm packages)                   │
│                                                                   │
│   ┌──────────────────────────────────────────────────────────┐   │
│   │  @mariozechner/pi-coding-agent                            │   │
│   │    AgentSession • SessionManager • Extension API          │   │
│   │    createReadTool • createBashTool • createEditTool        │   │
│   │    createWriteTool • createGrepTool • createFindTool       │   │
│   ├──────────────────────────────────────────────────────────┤   │
│   │  @mariozechner/pi-agent-core                              │   │
│   │    Agent • agentLoop • AgentTool • AgentEvent             │   │
│   │    Steering • Follow-up • Event subscription              │   │
│   ├──────────────────────────────────────────────────────────┤   │
│   │  @mariozechner/pi-ai                                      │   │
│   │    stream() • 20+ LLM providers • Model registry          │   │
│   │    Anthropic • OpenAI • Google • Bedrock • Local          │   │
│   └──────────────────────────────────────────────────────────┘   │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 Data Flow Overview

```
                    ┌─────────┐
         ┌─────────│ Telegram │
         │         └─────────┘
         │         ┌─────────┐
Inbound  ├─────────│  Slack   │
Messages │         └─────────┘
         │         ┌─────────┐
         └─────────│   CLI    │
                   └────┬────┘
                        │
                        ▼
              ┌─────────────────┐
              │  Store in SQLite │
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐
              │  Orchestrator    │
              │  (message loop)  │
              └────────┬────────┘
                       │
            ┌──────────┼──────────┐
            │          │          │
            ▼          ▼          ▼
      ┌──────────┐ ┌───────┐ ┌──────┐
      │ Trigger  │ │ Group │ │ Load │
      │ Check    │ │ Lookup│ │ Hist │
      └────┬─────┘ └───┬───┘ └──┬───┘
           │           │        │
           └─────┬─────┘        │
                 │              │
                 ▼              │
        ┌────────────────┐      │
        │ Build prompt   │◀─────┘
        │ (history +     │
        │  memory +      │
        │  system prompt)│
        └───────┬────────┘
                │
                ▼
   ┌─────────────────────────┐
   │ pi-mono Agent Loop      │
   │                         │
   │  ┌──────────────────┐   │
   │  │ LLM Call         │   │     ┌────────────────┐
   │  │ (stream via      │   │     │ Permission     │
   │  │  pi-ai)          │   │     │ Engine         │
   │  └────────┬─────────┘   │     │                │
   │           │              │     │ allow → run    │
   │  ┌────────▼─────────┐   │     │ ask   → pause  │
   │  │ Tool Call?       │───┼────▶│ deny  → reject │
   │  │                  │   │     └────────────────┘
   │  └────────┬─────────┘   │
   │           │              │
   │  ┌────────▼─────────┐   │     ┌────────────────┐
   │  │ Execute Tool     │───┼────▶│ EventBus       │
   │  │                  │   │     │ tool.before     │
   │  └────────┬─────────┘   │     │ tool.after      │
   │           │              │     │ tool.denied     │
   │  ┌────────▼─────────┐   │     └────────────────┘
   │  │ More tools?      │   │
   │  │ Yes → loop back  │   │
   │  │ No  → final text │   │
   │  └────────┬─────────┘   │
   │           │              │
   └───────────┼──────────────┘
               │
               ▼
      ┌────────────────┐
      │ Format output  │
      │ Route to       │
      │ correct channel│
      └────────┬───────┘
               │
      ┌────────┼────────┐
      │        │        │
      ▼        ▼        ▼
  Telegram   Slack     CLI
```

---

## 3. Dependency Map

### 3.1 What pi-mono Provides (DO NOT reimplement)

| pi-mono Package | What It Provides | We Use It For |
|-----------------|------------------|---------------|
| `@mariozechner/pi-ai` | Unified streaming LLM API for 20+ providers (Anthropic, OpenAI, Google, Bedrock, Mistral, Groq, local models, etc.) | All LLM calls. Never call provider APIs directly. |
| `@mariozechner/pi-agent-core` | `Agent` class with event-driven loop, tool execution, steering/follow-up messages, `AgentTool` interface | The agent loop. We create an `Agent`, give it tools, subscribe to events, call `agentLoop()`. |
| `@mariozechner/pi-coding-agent` | Built-in tools (`createReadTool`, `createBashTool`, etc.), `SessionManager` for JSONL persistence, Extension API, resource discovery | Built-in tools, session persistence, and the extension system for plugins. |

### 3.2 What the Framework Provides (we build this)

| Module | Why pi-mono Doesn't Have It |
|--------|---------------------------|
| **Channel System** | pi-mono is a CLI tool. It has no concept of Telegram, Slack, WeChat. |
| **Permission Engine** | pi-mono's extensions can intercept tools, but there's no declarative permission config. |
| **Group Manager** | pi-mono runs in a single project directory. No multi-group isolation. |
| **Orchestrator** | pi-mono doesn't route messages between channels and agents. |
| **Storage (SQLite)** | pi-mono uses JSONL files. We need SQLite for message querying, task storage. |
| **Scheduler** | pi-mono has no cron/interval task system. |
| **Audit EventBus** | pi-mono has agent events but no framework-level audit bus. |

### 3.3 npm Dependencies

```json
{
  "dependencies": {
    "@mariozechner/pi-ai": "^0.55.4",
    "@mariozechner/pi-agent-core": "^0.55.4",
    "@mariozechner/pi-coding-agent": "^0.55.4",

    "better-sqlite3": "^11.8.1",
    "cron-parser": "^5.5.0",
    "pino": "^9.6.0",
    "pino-pretty": "^13.0.0",
    "yaml": "^2.8.2",
    "zod": "^4.3.6",
    "glob": "^11.0.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.12",
    "@types/node": "^22.10.0",
    "typescript": "^5.7.0",
    "tsx": "^4.19.0",
    "vitest": "^4.0.18"
  }
}
```

---

## 4. Project Structure Conventions

### 4.1 Directory Layout

```
my-assistant/                          # Project root
│
├── index.ts                           # Entry point (one-line startup)
├── package.json
├── tsconfig.json
│
├── config/                            # Configuration (required)
│   ├── app.ts                         # Main config: name, trigger, model, agent behavior
│   └── permissions.yml                # Permission rules (YAML for human readability)
│
├── channels/                          # Message channels (auto-scanned)
│   ├── telegram.ts                    # Each file exports: defineChannel({...})
│   ├── slack.ts
│   ├── cli.ts                         # CLI channel for development/debugging
│   └── wechat.ts
│
├── tools/                             # Custom tools (auto-scanned)
│   ├── web-search.ts                  # Each file exports: defineTool({...})
│   ├── send-email.ts
│   └── deploy.ts
│
├── plugins/                           # Plugins (auto-scanned)
│   ├── audit-log.ts                   # Each file exports: definePlugin({...})
│   ├── rate-limit.ts
│   └── dangerous-guard.ts
│
├── skills/                            # Prompt templates (auto-scanned)
│   ├── code-review/
│   │   └── SKILL.md                   # Markdown with frontmatter
│   └── daily-report/
│       └── SKILL.md
│
├── groups/                            # Per-group isolated data (auto-created)
│   ├── global/
│   │   └── CLAUDE.md                  # Global memory (all groups read)
│   ├── tg_family/
│   │   ├── CLAUDE.md                  # Group-specific memory
│   │   ├── session.jsonl              # Conversation history
│   │   └── files/                     # Files created by the agent
│   └── slack_work/
│       ├── CLAUDE.md
│       ├── session.jsonl
│       └── files/
│
├── store/                             # Persistent storage (gitignored)
│   └── main.db                        # SQLite database
│
├── data/                              # Runtime data (gitignored)
│   ├── sessions/                      # pi-mono session data per group
│   │   └── {group}/.claude/
│   └── ipc/                           # Container IPC (if using containers)
│       └── {group}/
│
└── logs/                              # Log files (gitignored)
    ├── app.log                        # Application log (pino)
    └── audit.jsonl                    # Audit trail (every tool call)
```

### 4.2 Convention Rules

| Convention | Rule | Example |
|------------|------|---------|
| **Tool files** | `tools/*.ts`, must `export default defineTool({...})` | `tools/web-search.ts` |
| **Channel files** | `channels/*.ts`, must `export default defineChannel({...})` | `channels/telegram.ts` |
| **Plugin files** | `plugins/*.ts`, must `export default definePlugin({...})` | `plugins/audit-log.ts` |
| **Skill files** | `skills/*/SKILL.md`, Markdown with YAML frontmatter | `skills/code-review/SKILL.md` |
| **Group folders** | `groups/{channel}_{name}/`, auto-created on registration | `groups/tg_family/` |
| **Group memory** | `groups/{name}/CLAUDE.md`, read by agent as context | Contains preferences, facts |
| **Global memory** | `groups/global/CLAUDE.md`, read by ALL agents | Shared across all groups |

### 4.3 Entry Point

```typescript
// index.ts — the entire entry point
import { createApp } from './framework/core.js'

const app = await createApp({ root: import.meta.dirname })
await app.start()
```

That's it. The framework scans directories, registers everything, connects channels, and starts the message loop.

---

## 5. Module 1: Config Loader

### 5.1 Purpose

Load, validate, and merge configuration from multiple sources. Provide typed access to all config values.

### 5.2 Config Sources (priority low → high)

```
1. Framework defaults (hardcoded)
2. config/app.ts (project-level)
3. Environment variables (highest priority, override everything)
```

### 5.3 Config Schema

```typescript
// framework/types.ts — AppConfig

export interface AppConfig {
  /** Assistant name, used in trigger pattern and system prompts */
  name: string                    // default: "Andy"

  /** Trigger pattern. Messages must start with this to activate the agent.
   *  Set to empty string "" to respond to ALL messages (no trigger needed). */
  trigger: string                 // default: "@Andy"

  /** LLM provider configuration */
  provider: {
    /** Provider ID: "anthropic" | "openai" | "google" | "bedrock" | ... */
    default: string               // default: "anthropic"

    /** Model ID to use */
    model: string                 // default: "claude-sonnet-4-6"

    /** Maximum output tokens */
    maxTokens: number             // default: 8192

    /** Thinking level for extended thinking models */
    thinkingLevel?: 'none' | 'low' | 'medium' | 'high'

    /** Fallback provider when primary fails */
    fallback?: {
      provider: string
      model: string
    }
  }

  /** Agent behavior constraints */
  agent: {
    /** Maximum tool-call turns per user message. Prevents infinite loops. */
    maxTurns: number              // default: 20

    /** Maximum concurrent agents across all groups */
    maxConcurrent: number         // default: 5

    /** Idle timeout (ms). Agent shuts down after this much inactivity. */
    idleTimeout: number           // default: 1800000 (30 min)

    /** Context window management */
    compaction: {
      /** Auto-compact when context exceeds threshold */
      auto: boolean               // default: true
      /** Compact when context reaches this % of model's window */
      threshold: number           // default: 0.8
    }
  }

  /** Message polling interval (ms) */
  pollInterval: number            // default: 2000

  /** Scheduler polling interval (ms) */
  schedulerInterval: number       // default: 60000

  /** Timezone for scheduled tasks */
  timezone: string                // default: system timezone

  /** Container isolation settings (optional) */
  isolation?: {
    /** 'container' = Docker/Apple Container, 'process' = child process, 'none' = in-process */
    mode: 'container' | 'process' | 'none'
    /** Container image name */
    image?: string
    /** Mount project directory as readonly */
    mountReadonly?: boolean        // default: true
  }
}
```

### 5.4 Config File Format

```typescript
// config/app.ts
import { defineConfig } from '../framework/config.js'

export default defineConfig({
  name: 'Andy',
  trigger: '@Andy',

  provider: {
    default: 'anthropic',
    model: 'claude-sonnet-4-6',
    maxTokens: 8192,
  },

  agent: {
    maxTurns: 20,
    maxConcurrent: 5,
    idleTimeout: 1800000,
    compaction: { auto: true, threshold: 0.8 },
  },
})
```

### 5.5 Implementation

```typescript
// framework/config.ts

import { z } from 'zod'
import path from 'path'
import fs from 'fs'

// Zod schema for validation
const AppConfigSchema = z.object({
  name: z.string().default('Andy'),
  trigger: z.string().default('@Andy'),
  provider: z.object({
    default: z.string().default('anthropic'),
    model: z.string().default('claude-sonnet-4-6'),
    maxTokens: z.number().int().positive().default(8192),
    thinkingLevel: z.enum(['none', 'low', 'medium', 'high']).optional(),
    fallback: z.object({
      provider: z.string(),
      model: z.string(),
    }).optional(),
  }).default({}),
  agent: z.object({
    maxTurns: z.number().int().min(1).max(100).default(20),
    maxConcurrent: z.number().int().min(1).max(20).default(5),
    idleTimeout: z.number().int().min(10000).default(1800000),
    compaction: z.object({
      auto: z.boolean().default(true),
      threshold: z.number().min(0.1).max(1.0).default(0.8),
    }).default({}),
  }).default({}),
  pollInterval: z.number().int().min(500).default(2000),
  schedulerInterval: z.number().int().min(10000).default(60000),
  timezone: z.string().default(Intl.DateTimeFormat().resolvedOptions().timeZone),
  isolation: z.object({
    mode: z.enum(['container', 'process', 'none']).default('none'),
    image: z.string().optional(),
    mountReadonly: z.boolean().default(true),
  }).optional(),
})

export type AppConfig = z.infer<typeof AppConfigSchema>

/** Helper for type-safe config files */
export function defineConfig(config: Partial<AppConfig>): Partial<AppConfig> {
  return config
}

/** Load and validate config */
export async function loadConfig(rootDir: string): Promise<AppConfig> {
  const configPath = path.join(rootDir, 'config', 'app.ts')

  let userConfig: Partial<AppConfig> = {}
  if (fs.existsSync(configPath)) {
    const mod = await import(configPath)
    userConfig = mod.default || {}
  }

  // Environment variable overrides
  if (process.env.ASSISTANT_NAME) userConfig.name = process.env.ASSISTANT_NAME
  if (process.env.ASSISTANT_TRIGGER) userConfig.trigger = process.env.ASSISTANT_TRIGGER
  if (process.env.LLM_MODEL) {
    userConfig.provider = { ...userConfig.provider, model: process.env.LLM_MODEL } as any
  }

  // Validate and apply defaults
  return AppConfigSchema.parse(userConfig)
}
```

### 5.6 Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| TypeScript config file, not JSON/YAML | Type checking, IDE autocomplete, can import helpers |
| Zod validation with defaults | Invalid config fails fast at startup, not at runtime |
| Env vars override file config | Standard for deployment, no code changes needed |
| `defineConfig()` helper | Provides type inference without requiring the developer to import the schema |

---

## 6. Module 2: EventBus

### 6.1 Purpose

Type-safe publish/subscribe system. Every framework operation emits an event. Plugins subscribe to events for audit logging, rate limiting, custom behavior.

### 6.2 Why Not Use pi-mono's Events?

pi-mono's `Agent.subscribe()` only covers agent-level events (tool calls, text deltas). We need framework-level events: message routing, permission decisions, channel connections, scheduler runs, group management. The framework EventBus wraps and extends pi-mono's events.

### 6.3 Event Catalog

See [Appendix C](#appendix-c-event-catalog) for the complete list. Key categories:

| Category | Events | Emitted By |
|----------|--------|------------|
| **App lifecycle** | `app.start`, `app.stop`, `app.error` | Orchestrator |
| **Messages** | `message.inbound`, `message.outbound` | Channel, Orchestrator |
| **Agent** | `agent.start`, `agent.turn`, `agent.end` | Orchestrator (from pi-mono events) |
| **Tools** | `tool.before`, `tool.after`, `tool.denied`, `tool.error` | Tool wrapper + Permission Engine |
| **Permissions** | `permission.ask`, `permission.approved`, `permission.rejected` | Tool wrapper + Permission Engine |
| **Sessions** | `session.created`, `session.compacted` | Orchestrator / SessionManager bridge |
| **Tasks** | `task.scheduled`, `task.executed`, `task.failed` | Scheduler |
| **Channels** | `channel.connected`, `channel.disconnected`, `channel.error` | Channel Registry |
| **Groups** | `group.registered`, `group.removed` | Group Manager |

### 6.4 Interface

```typescript
// framework/event-bus.ts

export type EventHandler<T = unknown> = (data: T) => void | Promise<void>

export class EventBus {
  /**
   * Subscribe to a specific event type.
   * Returns an unsubscribe function.
   */
  on<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): () => void

  /**
   * Subscribe to ALL events (for audit logging).
   * Handler receives event name + data.
   */
  onAll(handler: (event: string, data: unknown) => void | Promise<void>): () => void

  /**
   * Emit an event. All handlers are called.
   * Errors in handlers are caught and logged, never propagate to emitter.
   */
  async emit<K extends keyof EventMap>(event: K, data: EventMap[K]): Promise<void>

  /**
   * Remove all listeners (used in testing and shutdown).
   */
  clear(): void
}
```

### 6.5 Implementation

```typescript
// framework/event-bus.ts

import { logger } from './logger.js'

export class EventBus {
  private handlers = new Map<string, Set<EventHandler>>()
  private allHandlers = new Set<(event: string, data: unknown) => void | Promise<void>>()

  on<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set())
    }
    const set = this.handlers.get(event)!
    set.add(handler as EventHandler)
    return () => set.delete(handler as EventHandler)
  }

  onAll(handler: (event: string, data: unknown) => void | Promise<void>): () => void {
    this.allHandlers.add(handler)
    return () => this.allHandlers.delete(handler)
  }

  async emit<K extends keyof EventMap>(event: K, data: EventMap[K]): Promise<void> {
    const handlers = this.handlers.get(event)
    const promises: Promise<void>[] = []

    if (handlers) {
      for (const handler of handlers) {
        try {
          const result = handler(data)
          if (result instanceof Promise) promises.push(result.catch(err =>
            logger.error({ event, err }, 'EventBus handler error')
          ))
        } catch (err) {
          logger.error({ event, err }, 'EventBus handler error (sync)')
        }
      }
    }

    for (const handler of this.allHandlers) {
      try {
        const result = handler(event, data)
        if (result instanceof Promise) promises.push(result.catch(err =>
          logger.error({ event, err }, 'EventBus onAll handler error')
        ))
      } catch (err) {
        logger.error({ event, err }, 'EventBus onAll handler error (sync)')
      }
    }

    if (promises.length > 0) await Promise.all(promises)
  }

  clear(): void {
    this.handlers.clear()
    this.allHandlers.clear()
  }
}
```

### 6.6 Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Errors never propagate | A buggy plugin must never crash the framework |
| `onAll()` for audit | One handler sees everything — perfect for audit log plugin |
| Async handlers supported | Plugins may need to write to DB or send HTTP |
| Unsubscribe via returned function | Clean, no need to track handler references |

---

## 7. Module 3: Permission Engine

### 7.1 Purpose

**This is the primary mechanism for constraining AI behavior.**

Every tool call passes through the Permission Engine before execution. The engine evaluates declarative rules and returns one of three actions:

| Action | Behavior | User Experience |
|--------|----------|-----------------|
| `allow` | Execute immediately, no questions asked | Silent |
| `ask` | Pause execution, notify user, wait for approval | User sees: "Allow bash(`rm -rf temp/`)?" |
| `deny` | Reject immediately, tell AI the tool was denied | AI sees: "Permission denied" and adapts |

### 7.2 Permission Config Format

```yaml
# config/permissions.yml
#
# Rules are evaluated top-to-bottom. First match wins.
# More specific rules should come before general ones.

default: ask                     # If no rule matches, ask the user

rules:
  # ── Reading ──
  - tool: read
    action: allow                # Reading files is generally safe

  - tool: read
    pattern: "**/.env*"
    action: deny                 # But never read .env files

  - tool: read
    pattern: "**/*secret*"
    action: deny

  - tool: read
    pattern: "**/*credential*"
    action: deny

  # ── Writing ──
  - tool: write
    action: ask                  # Always confirm before writing

  - tool: edit
    action: ask                  # Always confirm before editing

  # ── Shell ──
  - tool: bash
    pattern: "rm -rf *"
    action: deny                 # Never allow rm -rf

  - tool: bash
    pattern: "rm *"
    action: ask                  # Confirm other rm commands

  - tool: bash
    pattern: "git push*"
    action: ask                  # Confirm pushes

  - tool: bash
    pattern: "curl*|*sh"
    action: deny                 # Never pipe curl to shell

  - tool: bash
    action: ask                  # All other bash: ask

  # ── Network ──
  - tool: web_search
    action: allow                # Search is safe

  - tool: web_fetch
    action: allow                # Fetching is safe

  # ── Communication ──
  - tool: send_message
    action: ask                  # Always confirm outbound messages

  - tool: send_email
    action: ask
```

### 7.3 Rule Matching Algorithm

```
Input: tool name + args + PermissionContext(groupId, sessionId, actor)

1. Extract the "matchable value" from args:
   - For "bash": args.command
   - For "read"/"write"/"edit": args.path
   - For other tools: JSON.stringify(args)

2. Check persisted "always" overrides (scoped by groupId):
   - Key: "groupId:tool:matchValue"
   - Loaded from config/overrides.yml at startup

3. Check session-level cache (scoped by groupId + sessionId):
   - Key: "groupId:sessionId:tool:matchValue"
   - If user previously said "allow for session" → allow
   - If user previously said "deny for session" → deny

4. Walk rules top-to-bottom:
   - If rule.tool matches (glob match: "bash" matches "bash", "*" matches all)
   - AND rule.pattern matches the matchable value (glob match)
   - → Return rule.action

5. No match → return default action
```

> **Design note**: Persisted `always` overrides are scoped by `groupId`, while in-memory `session` approvals are scoped by `(groupId, sessionId)`. That prevents approvals from leaking across groups or across reset/recreated sessions in the same group. The `actor` field enables different policies for agent vs scheduler vs admin-triggered actions.

### 7.4 Interface

```typescript
// framework/permission.ts

export type PermissionAction = 'allow' | 'ask' | 'deny'

export interface PermissionRule {
  tool: string        // Tool name or glob pattern ("bash", "file.*", "*")
  pattern?: string    // Value pattern (glob) to match against tool args
  action: PermissionAction
}

export interface PermissionConfig {
  default: PermissionAction
  rules: PermissionRule[]
  /** Path to persist "always" scope approvals. Loaded at startup, rewritten on save. */
  overridesPath?: string
}

/**
 * Every permission check includes full context so caching and auditing
 * are scoped correctly. No unscoped global approvals.
 */
export interface PermissionContext {
  /** Channel-specific chat ID (e.g., "tg:123456") */
  groupId: string
  /** pi-mono session ID for this conversation */
  sessionId: string
  /** Who initiated the action: "agent", "scheduler", "admin" */
  actor: string
}

export class PermissionEngine {
  constructor(config: PermissionConfig)

  /**
   * Evaluate a tool call against the permission rules.
   * Session cache is scoped by (groupId, sessionId, tool, matchValue).
   * Persisted "always" overrides are scoped by (groupId, tool, matchValue).
   *
   * @param toolName - The tool being called
   * @param args - The tool arguments
   * @param ctx - Permission context (group, session, actor)
   */
  evaluate(toolName: string, args: Record<string, unknown>, ctx: PermissionContext): PermissionAction

  /**
   * Record a scoped approval.
   * - scope 'session': cached in-memory, keyed by (groupId, sessionId, tool, pattern)
   * - scope 'always': persisted to overridesPath YAML file
   */
  approve(toolName: string, ctx: PermissionContext, scope: 'session' | 'always', pattern?: string): void

  /**
   * Record a scoped denial.
   */
  deny(toolName: string, ctx: PermissionContext, scope: 'session' | 'always', pattern?: string): void

  /**
   * Reload rules from config file (for hot-reload support).
   */
  reload(config: PermissionConfig): void
}
```

### 7.5 Implementation

```typescript
// framework/permission.ts

import { minimatch } from 'minimatch'
import fs from 'fs'
import path from 'path'
import YAML from 'yaml'
import { logger } from './logger.js'

export class PermissionEngine {
  private config: PermissionConfig
  /**
   * Session-scoped cache: keyed by "groupId:sessionId:toolName:matchValue"
   * NOT global — approvals do not bleed across groups or sessions.
   */
  private sessionCache = new Map<string, PermissionAction>()
  /** Persistent overrides loaded from overridesPath YAML file */
  private persistedOverrides = new Map<string, PermissionAction>()

  constructor(config: PermissionConfig) {
    this.config = config
    // Load persisted "always" overrides if file exists
    if (config.overridesPath && fs.existsSync(config.overridesPath)) {
      const raw = YAML.parse(fs.readFileSync(config.overridesPath, 'utf-8')) || {}
      for (const [key, action] of Object.entries(raw)) {
        this.persistedOverrides.set(key, action as PermissionAction)
      }
    }
    logger.info(
      { ruleCount: config.rules.length, default: config.default },
      'Permission engine initialized'
    )
  }

  evaluate(toolName: string, args: Record<string, unknown>, ctx: PermissionContext): PermissionAction {
    // 1. Extract matchable value from args
    const matchValue = this.extractMatchValue(toolName, args)

    // 2. Check persisted "always" overrides (scoped by group)
    const alwaysKey = `${ctx.groupId}:${toolName}:${matchValue}`
    const persisted = this.persistedOverrides.get(alwaysKey)
      ?? this.persistedOverrides.get(`${ctx.groupId}:${toolName}:*`)
    if (persisted) return persisted

    // 3. Check session cache (scoped by group + session)
    const sessionKey = `${ctx.groupId}:${ctx.sessionId}:${toolName}:${matchValue}`
    const cached = this.sessionCache.get(sessionKey)
    if (cached) return cached

    // Also check tool-level cache (no pattern) scoped by group + session
    const toolCached = this.sessionCache.get(`${ctx.groupId}:${ctx.sessionId}:${toolName}:*`)
    if (toolCached) return toolCached

    // 4. Walk rules
    for (const rule of this.config.rules) {
      if (!this.matchTool(rule.tool, toolName)) continue
      if (rule.pattern && !this.matchPattern(rule.pattern, matchValue)) continue
      return rule.action
    }

    // 5. Default
    return this.config.default
  }

  approve(toolName: string, ctx: PermissionContext, scope: 'session' | 'always', pattern?: string): void {
    if (scope === 'always') {
      const key = `${ctx.groupId}:${toolName}:${pattern || '*'}`
      this.persistedOverrides.set(key, 'allow')
      this.persistOverrides()
    } else {
      const key = `${ctx.groupId}:${ctx.sessionId}:${toolName}:${pattern || '*'}`
      this.sessionCache.set(key, 'allow')
    }
  }

  deny(toolName: string, ctx: PermissionContext, scope: 'session' | 'always', pattern?: string): void {
    if (scope === 'always') {
      const key = `${ctx.groupId}:${toolName}:${pattern || '*'}`
      this.persistedOverrides.set(key, 'deny')
      this.persistOverrides()
    } else {
      const key = `${ctx.groupId}:${ctx.sessionId}:${toolName}:${pattern || '*'}`
      this.sessionCache.set(key, 'deny')
    }
  }

  reload(config: PermissionConfig): void {
    this.config = config
    this.sessionCache.clear()
    // Do NOT clear persistedOverrides — those survive reloads
    logger.info({ ruleCount: config.rules.length }, 'Permission rules reloaded')
  }

  private persistOverrides(): void {
    if (!this.config.overridesPath) return
    const obj: Record<string, string> = {}
    for (const [k, v] of this.persistedOverrides) obj[k] = v
    fs.writeFileSync(this.config.overridesPath, YAML.stringify(obj))
  }

  private extractMatchValue(toolName: string, args: Record<string, unknown>): string {
    // Tool-specific extraction
    if (toolName === 'bash' && typeof args.command === 'string') return args.command
    if (['read', 'write', 'edit'].includes(toolName) && typeof args.path === 'string') return args.path
    if (typeof args.query === 'string') return args.query
    if (typeof args.url === 'string') return args.url
    return JSON.stringify(args)
  }

  private matchTool(pattern: string, toolName: string): boolean {
    if (pattern === '*') return true
    return minimatch(toolName, pattern)
  }

  private matchPattern(pattern: string, value: string): boolean {
    return minimatch(value, pattern, { dot: true })
  }
}

/** Load permissions from YAML file */
export function loadPermissions(rootDir: string): PermissionConfig {
  const permPath = path.join(rootDir, 'config', 'permissions.yml')
  const overridesPath = path.join(rootDir, 'config', 'overrides.yml')
  if (!fs.existsSync(permPath)) {
    logger.warn('No permissions.yml found, using default: ask for everything')
    return { default: 'ask', rules: [], overridesPath }
  }
  const raw = fs.readFileSync(permPath, 'utf-8')
  const parsed = YAML.parse(raw)
  return {
    default: parsed.default || 'ask',
    rules: (parsed.rules || []).map((r: any) => ({
      tool: r.tool,
      pattern: r.pattern,
      action: r.action,
    })),
    overridesPath,
  }
}
```

### 7.6 Integration with pi-mono Tools

The Permission Engine wraps pi-mono's `AgentTool` interface. This is the bridge:

```typescript
// framework/tool-wrapper.ts

import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core'
import type { EventBus } from './event-bus.js'
import type { PermissionEngine, PermissionContext } from './permission.js'
import type { PluginRuntime } from './plugin.js'

export interface AskFunction {
  (tool: string, args: unknown): Promise<{
    approved: boolean
    scope: 'once' | 'session' | 'always'
  }>
}

/**
 * Wrap an array of pi-mono AgentTools with permission checks.
 * The wrapped tools have identical interfaces — the Agent doesn't know
 * about permissions. It just sees tools that sometimes return errors.
 */
export function wrapToolsWithPermissions(
  tools: AgentTool[],
  permissions: PermissionEngine,
  bus: EventBus,
  askFn: AskFunction,
  permCtx: PermissionContext,
  plugins: PluginRuntime,
): AgentTool[] {
  return tools.map(tool => ({
    ...tool,
    execute: async (callId, params, signal, onUpdate) => {
      let args = params as Record<string, unknown>

      // Interceptors run before permission evaluation. They can deny or transform args,
      // but they do NOT bypass the permission engine.
      const intercept = await plugins.applyToolInterceptors({
        tool: tool.name,
        args,
        groupId: permCtx.groupId,
        actor: permCtx.actor,
      })
      if (intercept.action === 'deny') {
        await bus.emit('tool.denied', {
          tool: tool.name,
          args,
          reason: intercept.reason,
          sessionId: permCtx.sessionId,
          groupId: permCtx.groupId,
          actor: permCtx.actor,
        })
        return {
          content: [{ type: 'text' as const, text: `[Blocked by plugin] ${intercept.reason}` }],
          isError: true,
          details: {},
        }
      }
      args = intercept.args

      // Evaluate permission
      const action = permissions.evaluate(tool.name, args, permCtx)

      await bus.emit('tool.before', {
        tool: tool.name,
        args,
        permission: action,
        sessionId: permCtx.sessionId,
        groupId: permCtx.groupId,
        actor: permCtx.actor,
      })

      if (action === 'deny') {
        await bus.emit('tool.denied', {
          tool: tool.name,
          args,
          reason: 'Permission rule: deny',
          sessionId: permCtx.sessionId,
          groupId: permCtx.groupId,
          actor: permCtx.actor,
        })
        return {
          content: [{ type: 'text' as const, text: `[Permission denied] Tool "${tool.name}" is not allowed with these arguments.` }],
          isError: true,
          details: {},
        }
      }

      if (action === 'ask') {
        await bus.emit('permission.ask', {
          tool: tool.name,
          args,
          sessionId: permCtx.sessionId,
          groupId: permCtx.groupId,
          actor: permCtx.actor,
        })

        const response = await askFn(tool.name, args)

        if (!response.approved) {
          await bus.emit('permission.rejected', {
            tool: tool.name,
            sessionId: permCtx.sessionId,
            groupId: permCtx.groupId,
            actor: permCtx.actor,
          })
          await bus.emit('tool.denied', {
            tool: tool.name,
            args,
            reason: 'User rejected',
            sessionId: permCtx.sessionId,
            groupId: permCtx.groupId,
            actor: permCtx.actor,
          })
          return {
            content: [{ type: 'text' as const, text: `[User rejected] Tool "${tool.name}" was not approved by the user.` }],
            isError: true,
            details: {},
          }
        }

        // Cache approval based on scope
        if (response.scope === 'session') {
          permissions.approve(tool.name, permCtx, 'session', extractMatchValue(tool.name, args))
        } else if (response.scope === 'always') {
          permissions.approve(tool.name, permCtx, 'always', extractMatchValue(tool.name, args))
        }

        await bus.emit('permission.approved', {
          tool: tool.name,
          scope: response.scope,
          sessionId: permCtx.sessionId,
          groupId: permCtx.groupId,
          actor: permCtx.actor,
        })
      }

      // Execute the tool
      const startTime = Date.now()
      try {
        const result = await tool.execute(callId, args as typeof params, signal, onUpdate)
        const durationMs = Date.now() - startTime

        await bus.emit('tool.after', {
          tool: tool.name,
          result: summarizeResult(result),
          durationMs,
          sessionId: permCtx.sessionId,
          groupId: permCtx.groupId,
          actor: permCtx.actor,
        })

        return result
      } catch (err) {
        const durationMs = Date.now() - startTime

        await bus.emit('tool.error', {
          tool: tool.name,
          error: err instanceof Error ? err : new Error(String(err)),
          durationMs,
          sessionId: permCtx.sessionId,
          groupId: permCtx.groupId,
          actor: permCtx.actor,
        })

        throw err
      }
    },
  }))
}

/** Summarize tool result for event (avoid huge payloads in event bus) */
function summarizeResult(result: AgentToolResult): unknown {
  if (!result.content) return null
  const text = result.content
    .filter(c => c.type === 'text')
    .map(c => (c as { type: 'text'; text: string }).text)
    .join('\n')
  return text.length > 500 ? text.slice(0, 500) + '...' : text
}

function extractMatchValue(toolName: string, args: Record<string, unknown>): string {
  // Keep in sync with PermissionEngine.extractMatchValue().
  if (toolName === 'bash' && typeof args.command === 'string') return args.command
  if (['read', 'write', 'edit'].includes(toolName) && typeof args.path === 'string') return args.path
  if (typeof args.query === 'string') return args.query
  if (typeof args.url === 'string') return args.url
  return JSON.stringify(args)
}
```

### 7.7 How "ask" Works Across Different Channels

When the Permission Engine returns `ask`, the framework needs to pause and get human input. This works differently per channel:

| Channel | How "ask" Works |
|---------|-----------------|
| **CLI** | Print prompt to terminal, wait for stdin `y/n/session/always` |
| **Telegram** | Send inline keyboard buttons (Once / Session / Always / Deny) |
| **Slack** | Send Block Kit message with buttons carrying approval scope |
| **WeChat** | Send a text prompt that maps replies to `once/session/always/deny` |

The `askFn` is provided by each channel's adapter. The Orchestrator coordinates:

```typescript
// Orchestrator passes the right askFn based on the message's source channel
const askFn: AskFunction = async (tool, args) => {
  const channel = this.channels.get(msg.channelName)
  if (channel?.askPermission) {
    return channel.askPermission(msg.chatId, tool, args, {
      title: `Permission request in ${group.name}`,
      requester: permCtx.actor,
    })
  }
  return this.askViaMainGroup(msg.chatId, group.name, tool, args, permCtx.actor)
}
```

---

## 8. Module 4: Tool System

### 8.1 Purpose

Provide a convention-based way for developers to add custom tools. Tools are the AI's "hands" — they let it interact with the world (search the web, read files, run commands, send emails).

### 8.2 Two Kinds of Tools

| Kind | Source | Registration |
|------|--------|-------------|
| **Built-in tools** | pi-mono's `createReadTool()`, `createBashTool()`, etc. | Framework includes them automatically |
| **Custom tools** | Developer-written files in `tools/` directory | Framework auto-scans and registers |

### 8.3 Custom Tool Definition API

```typescript
// framework/tool.ts

import { z } from 'zod'
import type { AgentTool } from '@mariozechner/pi-agent-core'

export interface ToolDefinition<TParams extends z.ZodObject<any> = z.ZodObject<any>> {
  /** Unique tool name (used in permission rules and events) */
  name: string

  /** Human-readable description (sent to LLM so it knows when to use this tool) */
  description: string

  /** Zod schema for parameters. The framework validates args before execute(). */
  parameters: TParams

  /** Default permission level. Can be overridden by permissions.yml. */
  defaultPermission?: 'allow' | 'ask' | 'deny'

  /** Optional metadata for documentation and safety analysis */
  metadata?: {
    /** Category for grouping in docs */
    category?: string
    /** Does this tool have side effects? */
    sideEffects?: boolean
    /** Regex patterns that should trigger extra caution */
    dangerPatterns?: RegExp[]
  }

  /** Execute the tool. Receives validated args + context. */
  execute: (
    args: z.infer<TParams>,
    ctx: ToolContext,
  ) => Promise<ToolResult>
}

export interface ToolContext {
  /** Session ID for the current conversation */
  sessionId: string
  /** Chat ID (channel-specific identifier) */
  chatId: string
  /** Working directory for this group */
  workingDir: string
  /** Send a message to the current chat (for channel-aware tools such as send_message) */
  sendMessage?: (text: string) => Promise<void>
  /** Report progress during execution (optional) */
  onUpdate?: (partial: { status?: string; progress?: number }) => void
  /** Abort signal for cancellation */
  signal?: AbortSignal
}

export interface ToolResult {
  /** Text content to return to the LLM */
  content: string
  /** Metadata (logged but NOT sent to LLM) */
  details?: Record<string, unknown>
}

/** Type-safe helper for defining tools */
export function defineTool<TParams extends z.ZodObject<any>>(
  def: ToolDefinition<TParams>,
): ToolDefinition<TParams> {
  return def
}
```

### 8.4 Tool Examples

#### Example 1: Web Search Tool

```typescript
// tools/web-search.ts
import { defineTool } from '../framework/tool.js'
import { z } from 'zod'

export default defineTool({
  name: 'web_search',
  description: 'Search the internet for information. Returns a list of results with titles, URLs, and snippets.',

  parameters: z.object({
    query: z.string().min(1).max(200).describe('Search query'),
    maxResults: z.number().int().min(1).max(10).default(5).describe('Maximum number of results'),
  }),

  defaultPermission: 'allow',

  metadata: {
    category: 'network',
    sideEffects: false,
  },

  async execute(args, ctx) {
    ctx.onUpdate?.({ status: 'Searching...' })

    // Use your preferred search API
    const response = await fetch(`https://api.search.example/search?q=${encodeURIComponent(args.query)}&n=${args.maxResults}`)
    const data = await response.json()

    const results = data.results.map((r: any, i: number) =>
      `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.snippet}`
    ).join('\n\n')

    return {
      content: results || 'No results found.',
      details: { resultCount: data.results.length, query: args.query },
    }
  },
})
```

#### Example 2: Send Message Tool (for scheduled tasks)

```typescript
// tools/send-message.ts
import { defineTool } from '../framework/tool.js'
import { z } from 'zod'

export default defineTool({
  name: 'send_message',
  description: 'Send a message to the current chat group. Use this in scheduled tasks to deliver results.',

  parameters: z.object({
    text: z.string().min(1).max(10000).describe('Message text to send'),
  }),

  defaultPermission: 'ask',  // Always confirm outbound messages

  metadata: {
    category: 'communication',
    sideEffects: true,
  },

  async execute(args, ctx) {
    if (!ctx.sendMessage) {
      throw new Error('sendMessage helper is not available in this runtime')
    }
    await ctx.sendMessage(args.text)
    return {
      content: `Message sent: "${args.text.slice(0, 100)}..."`,
      details: { chatId: ctx.chatId, textLength: args.text.length },
    }
  },
})
```

### 8.5 Converting Custom Tools to pi-mono AgentTool

The framework converts `ToolDefinition` to pi-mono's `AgentTool` format:

```typescript
// framework/tool-loader.ts

import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core'
import { Type } from '@sinclair/typebox'
import { zodToJsonSchema } from 'zod-to-json-schema'
import type { ToolDefinition, ToolContext } from './tool.js'

/**
 * Convert a framework ToolDefinition to a pi-mono AgentTool.
 *
 * This bridges the gap between our developer-friendly API and
 * pi-mono's internal tool format.
 */
export function toAgentTool(def: ToolDefinition, ctx: ToolContext): AgentTool {
  // Convert Zod schema to JSON Schema (pi-mono uses TypeBox/JSON Schema)
  const jsonSchema = zodToJsonSchema(def.parameters)

  return {
    name: def.name,
    label: def.name,
    description: def.description,
    parameters: jsonSchema as any,

    execute: async (callId, params, signal, onUpdate) => {
      // Validate params with Zod
      const parseResult = def.parameters.safeParse(params)
      if (!parseResult.success) {
        return {
          content: [{
            type: 'text' as const,
            text: `Invalid parameters: ${parseResult.error.message}`,
          }],
          isError: true,
          details: {},
        }
      }

      // Build context with onUpdate bridge
      const toolCtx: ToolContext = {
        ...ctx,
        signal,
        onUpdate: onUpdate
          ? (partial) => onUpdate({
              content: [{ type: 'text' as const, text: partial.status || '' }],
              details: partial,
            })
          : undefined,
      }

      // Execute
      const result = await def.execute(parseResult.data, toolCtx)

      return {
        content: [{ type: 'text' as const, text: result.content }],
        details: result.details || {},
      }
    },
  }
}
```

### 8.6 Tool Auto-Scanning

```typescript
// framework/tool-loader.ts (continued)

import fs from 'fs'
import path from 'path'
import { logger } from './logger.js'

/**
 * Scan the tools/ directory and load all tool definitions.
 * Files must export default a ToolDefinition.
 */
export async function scanTools(toolsDir: string): Promise<ToolDefinition[]> {
  if (!fs.existsSync(toolsDir)) {
    logger.debug({ toolsDir }, 'No tools directory found')
    return []
  }

  const files = fs.readdirSync(toolsDir).filter(f => f.endsWith('.ts') || f.endsWith('.js'))
  const tools: ToolDefinition[] = []

  for (const file of files) {
    try {
      const mod = await import(path.join(toolsDir, file))
      const def = mod.default
      if (def && def.name && def.parameters && def.execute) {
        tools.push(def)
        logger.info({ tool: def.name, file }, 'Tool loaded')
      } else {
        logger.warn({ file }, 'File does not export a valid ToolDefinition')
      }
    } catch (err) {
      logger.error({ file, err }, 'Failed to load tool')
    }
  }

  return tools
}
```

---

## 9. Module 5: Channel System

### 9.1 Purpose

Abstract over messaging platforms (Telegram, Slack, WeChat, CLI, etc.) so the rest of the framework doesn't know or care where messages come from.

### 9.2 Channel Interface

```typescript
// framework/channel.ts

import type { Logger } from 'pino'

export interface ChannelDefinition {
  /** Unique channel name */
  name: string

  /** Environment variables required for this channel.
   *  If any are missing, the channel is skipped (not an error). */
  requiredEnv: string[]

  /** Channel capabilities declaration */
  capabilities?: {
    /** Supports "typing..." indicator */
    typing?: boolean
    /** Supports message threading */
    threading?: boolean
    /** Maximum message length (framework auto-splits longer messages) */
    maxMessageLength?: number
    /** Supported media types */
    multimedia?: ('image' | 'audio' | 'video' | 'document')[]
  }

  /**
   * Connect to the messaging platform.
   * Called once at startup. Must return a ConnectedChannel.
   * If credentials are invalid, throw an error.
   */
  connect: (ctx: ChannelContext) => Promise<ConnectedChannel>
}

export interface ChannelContext {
  /** Environment variables (filtered to requiredEnv) */
  env: Record<string, string>
  /** Callback: deliver an inbound message to the framework */
  inbound: (msg: InboundMessage) => void
  /** Callback: deliver chat metadata (group names, etc.) */
  onChatMetadata: (chatId: string, name: string, isGroup: boolean) => void
  /** Helper: split a long message into chunks respecting maxMessageLength */
  splitMessage: (text: string, maxLen: number) => string[]
  /** Logger scoped to this channel */
  logger: Logger
}

export interface ConnectedChannel {
  /** Send a text message to a chat */
  send: (chatId: string, text: string) => Promise<void>
  /** Show "typing..." indicator (optional) */
  setTyping?: (chatId: string, isTyping: boolean) => Promise<void>
  /** Handle permission "ask" — return user's decision. Optional metadata helps channels render the request. */
  askPermission?: (
    chatId: string,
    tool: string,
    args: unknown,
    meta?: {
      title?: string
      requester?: string
    }
  ) => Promise<{
    approved: boolean
    scope: 'once' | 'session' | 'always'
  }>
  /** Disconnect from the platform */
  disconnect: () => Promise<void>
  /** Check if this channel "owns" a given chatId */
  ownsChat: (chatId: string) => boolean
}

export interface InboundMessage {
  /** Channel-specific chat identifier (e.g., "tg:123456", "slack:C01ABC") */
  chatId: string
  /** Sender identifier */
  sender: string
  /** Sender display name */
  senderName: string
  /** Message content */
  content: string
  /** Is this a group chat? */
  isGroup: boolean
  /** Message timestamp */
  timestamp: Date
  /** Is this from the bot itself? */
  isFromMe?: boolean
  /** Unique message ID */
  messageId?: string
}

/** Helper for type-safe channel definition */
export function defineChannel(def: ChannelDefinition): ChannelDefinition {
  return def
}
```

### 9.3 Channel Examples

#### CLI Channel (for development)

```typescript
// channels/cli.ts
import { defineChannel } from '../framework/channel.js'
import readline from 'readline'

export default defineChannel({
  name: 'cli',
  requiredEnv: [],  // Always available, no credentials needed

  capabilities: {
    typing: false,
    threading: false,
    maxMessageLength: Infinity,
  },

  async connect(ctx) {
    const chatId = 'cli:local'
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

    ctx.onChatMetadata(chatId, 'CLI', false)

    rl.on('line', (line) => {
      if (line.trim()) {
        ctx.inbound({
          chatId,
          sender: 'user',
          senderName: 'User',
          content: line.trim(),
          isGroup: false,
          timestamp: new Date(),
        })
      }
    })

    // Print prompt
    process.stdout.write('\n> ')
    rl.on('line', () => process.stdout.write('> '))

    return {
      send: async (chatId, text) => {
        console.log(`\n${text}\n`)
        process.stdout.write('> ')
      },

      askPermission: async (chatId, tool, args, meta) => {
        return new Promise((resolve) => {
          const argsStr = JSON.stringify(args, null, 2)
          if (meta?.title) console.log(`\n${meta.title}`)
          console.log(`\n⚠ Permission required: ${tool}`)
          if (meta?.requester) console.log(`  Requested by: ${meta.requester}`)
          console.log(`  Args: ${argsStr.slice(0, 200)}`)
          rl.question('  Allow? (y/n/session/always): ', (answer) => {
            const a = answer.trim().toLowerCase()
            resolve({
              approved: ['y', 'yes', 'session', 's', 'always', 'a'].includes(a),
              scope: (a === 'always' || a === 'a')
                ? 'always'
                : (a === 'session' || a === 's')
                  ? 'session'
                  : 'once',
            })
          })
        })
      },

      disconnect: async () => rl.close(),

      ownsChat: (id) => id.startsWith('cli:'),
    }
  },
})
```

#### Telegram Channel

```typescript
// channels/telegram.ts
import { defineChannel } from '../framework/channel.js'

export default defineChannel({
  name: 'telegram',
  requiredEnv: ['TELEGRAM_BOT_TOKEN'],

  capabilities: {
    typing: true,
    threading: true,
    maxMessageLength: 4096,
    multimedia: ['image', 'audio', 'document'],
  },

  async connect(ctx) {
    // Use your preferred Telegram library (e.g., grammy, telegraf, node-telegram-bot-api)
    const { Bot } = await import('grammy')
    const bot = new Bot(ctx.env.TELEGRAM_BOT_TOKEN)

    bot.on('message:text', (tgCtx) => {
      const msg = tgCtx.message
      const chatId = `tg:${msg.chat.id}`
      const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup'

      ctx.onChatMetadata(chatId, msg.chat.title || msg.chat.first_name || chatId, isGroup)

      ctx.inbound({
        chatId,
        sender: String(msg.from?.id || 'unknown'),
        senderName: [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') || 'Unknown',
        content: msg.text,
        isGroup,
        timestamp: new Date(msg.date * 1000),
        messageId: String(msg.message_id),
      })
    })

    await bot.start()
    ctx.logger.info('Telegram bot connected')

    return {
      send: async (chatId, text) => {
        const tgChatId = chatId.replace('tg:', '')
        // Auto-split long messages
        for (const chunk of ctx.splitMessage(text, 4096)) {
          await bot.api.sendMessage(tgChatId, chunk)
        }
      },

      setTyping: async (chatId) => {
        const tgChatId = chatId.replace('tg:', '')
        await bot.api.sendChatAction(tgChatId, 'typing')
      },

      askPermission: async (chatId, tool, args, meta) => {
        const tgChatId = chatId.replace('tg:', '')
        const argsPreview = JSON.stringify(args).slice(0, 100)
        const header = meta?.title ? `*${meta.title}*\n` : ''
        const requester = meta?.requester ? `Requested by: \`${meta.requester}\`\n` : ''

        // Send inline keyboard
        const result = await bot.api.sendMessage(tgChatId,
          `${header}⚠️ *Permission required*\n${requester}Tool: \`${tool}\`\nArgs: \`${argsPreview}\``,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [[
                { text: '✅ Once', callback_data: 'perm_allow_once' },
                { text: '✅ Session', callback_data: 'perm_allow_session' },
                { text: '✅ Always', callback_data: 'perm_allow_always' },
                { text: '❌ Deny', callback_data: 'perm_deny' },
              ]],
            },
          },
        )

        // Wait for callback
        return new Promise((resolve) => {
          const handler = bot.callbackQuery(/^perm_/, async (cbCtx) => {
            if (cbCtx.message?.message_id !== result.message_id) return
            const data = cbCtx.callbackQuery.data
            await cbCtx.answerCallbackQuery()
            // Remove keyboard
            await cbCtx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } })
            resolve({
              approved: data !== 'perm_deny',
              scope: data === 'perm_allow_always'
                ? 'always'
                : data === 'perm_allow_session'
                  ? 'session'
                  : 'once',
            })
          })
        })
      },

      disconnect: async () => bot.stop(),

      ownsChat: (id) => id.startsWith('tg:'),
    }
  },
})
```

### 9.4 Channel Auto-Scanning

```typescript
// framework/channel-loader.ts

export async function scanChannels(
  channelsDir: string,
  env: Record<string, string>,
): Promise<Map<string, ChannelDefinition>> {
  const result = new Map<string, ChannelDefinition>()

  if (!fs.existsSync(channelsDir)) return result

  const files = fs.readdirSync(channelsDir).filter(f => f.endsWith('.ts') || f.endsWith('.js'))

  for (const file of files) {
    try {
      const mod = await import(path.join(channelsDir, file))
      const def = mod.default as ChannelDefinition

      if (!def?.name || !def?.connect) {
        logger.warn({ file }, 'File does not export a valid ChannelDefinition')
        continue
      }

      // Check if required env vars are present
      const missingEnv = (def.requiredEnv || []).filter(k => !env[k])
      if (missingEnv.length > 0) {
        logger.warn(
          { channel: def.name, missing: missingEnv },
          'Channel skipped: missing environment variables'
        )
        continue
      }

      result.set(def.name, def)
      logger.info({ channel: def.name, file }, 'Channel loaded')
    } catch (err) {
      logger.error({ file, err }, 'Failed to load channel')
    }
  }

  return result
}
```

---

## 10. Module 6: Group Manager

### 10.1 Purpose

Each chat group gets isolated state: its own working directory, memory file, session, and file storage. This prevents cross-group data leakage and gives each group its own "personality" via CLAUDE.md.

**Isolation enforcement**: In `mode: 'none'` (no container), group isolation depends entirely on passing `workingDir` to every built-in tool. The Orchestrator **must** create tools with `{ workingDir }` so that `bash` runs with `cwd = workingDir` and rejects `cd` outside, `read/write/edit` resolve paths relative to `workingDir` and reject `..` traversal, etc. In `mode: 'container'`, the OS-level mount boundary is the enforcement layer, but `workingDir` is still set for consistency.

### 10.2 Group Data Model

```typescript
// framework/group.ts

export interface GroupInfo {
  /** Channel-specific chat ID (e.g., "tg:123456") */
  chatId: string

  /** Human-readable group name */
  name: string

  /** Folder name under groups/ (e.g., "tg_family") */
  folder: string

  /** Channel name (e.g., "telegram") */
  channel: string

  /** Is this a group chat (vs 1:1 DM)? */
  isGroup: boolean

  /** Does this group require the trigger word? */
  requiresTrigger: boolean

  /** Is this the "main" control group (elevated privileges)? */
  isMain: boolean

  /** When was this group registered */
  registeredAt: string

  /** Optional container config overrides */
  containerConfig?: {
    additionalMounts?: Array<{
      hostPath: string
      containerPath?: string
      readonly?: boolean
    }>
    timeout?: number
  }
}
```

### 10.3 Directory Structure Per Group

```
groups/{folder}/
├── CLAUDE.md           # Group memory — agent reads this as context
├── session.jsonl       # Conversation history (human-readable)
├── files/              # Files the agent creates (notes, reports, etc.)
└── logs/               # Execution logs for this group
    └── container-*.log # Container run logs
```

### 10.4 Memory Hierarchy

```
Agent reads these CLAUDE.md files as context (top-down):

1. groups/global/CLAUDE.md       ← Shared across ALL groups
   "User prefers concise responses. Timezone: Asia/Shanghai."

2. groups/{folder}/CLAUDE.md     ← Group-specific
   "This is the family group. Members: Mom, Dad, Sister.
    Mom likes weather updates. Dad likes news summaries."
```

### 10.5 Group Manager Interface

```typescript
// framework/group.ts

export class GroupManager {
  constructor(
    private rootDir: string,
    private db: Storage,
    private bus: EventBus,
  ) {}

  /** Register a new group. Creates directory structure. */
  register(info: GroupInfo): void {
    const groupDir = path.join(this.rootDir, 'groups', info.folder)
    fs.mkdirSync(path.join(groupDir, 'files'), { recursive: true })
    fs.mkdirSync(path.join(groupDir, 'logs'), { recursive: true })

    // Create empty CLAUDE.md if it doesn't exist
    const memoryPath = path.join(groupDir, 'CLAUDE.md')
    if (!fs.existsSync(memoryPath)) {
      fs.writeFileSync(memoryPath, `# ${info.name}\n\nGroup memory. The agent will read this for context.\n`)
    }

    this.db.setGroup(info)
    void this.bus.emit('group.registered', {
      chatId: info.chatId,
      name: info.name,
      folder: info.folder,
    })
  }

  /** Get all registered groups */
  getAll(): Record<string, GroupInfo> {
    return this.db.getAllGroups()
  }

  /** Remove a group registration. Group files remain on disk. */
  remove(chatId: string): void {
    this.db.removeGroup(chatId)
    void this.bus.emit('group.removed', { chatId })
  }

  /** Get a specific group by chatId */
  get(chatId: string): GroupInfo | undefined {
    return this.db.getGroup(chatId)
  }

  /** Get the working directory for a group */
  getWorkingDir(folder: string): string {
    return path.join(this.rootDir, 'groups', folder)
  }

  /** Read the memory (CLAUDE.md) for a group, including global memory */
  readMemory(folder: string): string {
    const parts: string[] = []

    // Global memory
    const globalPath = path.join(this.rootDir, 'groups', 'global', 'CLAUDE.md')
    if (fs.existsSync(globalPath)) {
      parts.push(fs.readFileSync(globalPath, 'utf-8'))
    }

    // Group memory
    const groupPath = path.join(this.rootDir, 'groups', folder, 'CLAUDE.md')
    if (fs.existsSync(groupPath)) {
      parts.push(fs.readFileSync(groupPath, 'utf-8'))
    }

    return parts.join('\n\n---\n\n')
  }

  /** Get the session file path for a group */
  getSessionPath(folder: string): string {
    return path.join(this.rootDir, 'groups', folder, 'session.jsonl')
  }

  /** Validate group folder name (prevent path traversal) */
  static isValidFolder(folder: string): boolean {
    return /^[a-zA-Z0-9_-]+$/.test(folder) && !folder.includes('..')
  }
}
```

### 10.6 Main Group

One group is designated as "main" (the user's private chat). It has elevated privileges:

| Capability | Main Group | Other Groups |
|------------|-----------|--------------|
| No trigger required | ✅ | ❌ (need @Andy) |
| Register new groups | ✅ | ❌ |
| Schedule tasks for any group | ✅ | ❌ (own group only) |
| Read global memory | ✅ | ✅ |
| Write global memory | ✅ | ❌ |
| See all scheduled tasks | ✅ | ❌ (own tasks only) |

---

## 11. Module 7: Orchestrator

### 11.1 Purpose

The Orchestrator is the central coordinator. It connects all modules and runs the main message loop. It is the "glue" between channels, permissions, pi-mono agents, and groups.

### 11.2 Responsibilities

```
1. Start all channels
2. Poll SQLite for new messages
3. Match messages to registered groups
4. Check trigger patterns
5. Build agent context (history + memory + system prompt)
6. Create pi-mono Agent with permission-wrapped tools
7. Subscribe to agent events → forward to EventBus
8. Route agent output back to the correct channel
9. Handle concurrent groups (queue system)
10. Forward permission "ask" requests to the user's channel
```

### 11.3 Interface

```typescript
// framework/orchestrator.ts

export class Orchestrator {
  constructor(
    private config: AppConfig,
    private bus: EventBus,
    private permissions: PermissionEngine,
    private groups: GroupManager,
    private db: Storage,
    private plugins: PluginRuntime,
  ) {}

  /** Inject scheduler after construction (avoids circular dependency) */
  setScheduler(scheduler: Scheduler): void

  /** Start the orchestrator: connect channels, start loops */
  async start(channelDefs: Map<string, ChannelDefinition>, tools: ToolDefinition[]): Promise<void>

  /** Process a scheduled task (called by Scheduler) */
  async processScheduledTask(task: ScheduledTask): Promise<void>

  /** Route a permission ask to the main group channel */
  async askViaMainGroup(chatId: string, groupName: string, tool: string, args: unknown, actor: string): Promise<{ approved: boolean; scope: 'once' | 'session' | 'always' }>

  /** Stop everything gracefully */
  async stop(): Promise<void>
}
```

### 11.4 Implementation Outline

```typescript
// framework/orchestrator.ts

import { Agent } from '@mariozechner/pi-agent-core'
import {
  createReadTool, createWriteTool, createEditTool,
  createBashTool, createGrepTool, createFindTool, createLsTool,
} from '@mariozechner/pi-coding-agent'
import { wrapToolsWithPermissions } from './tool-wrapper.js'
import { toAgentTool } from './tool-loader.js'
import { PluginRuntime } from './plugin.js'

export class Orchestrator {
  private channels = new Map<string, ConnectedChannel>()
  private channelDefs = new Map<string, ChannelDefinition>()
  private customTools: ToolDefinition[] = []
  private running = false
  private activeAgents = new Map<string, { cancel: () => void }>()
  private scheduler?: Scheduler

  constructor(/* config, bus, permissions, groups, db, plugins */) {}

  /** Inject scheduler after construction to break circular dependency */
  setScheduler(scheduler: Scheduler): void {
    this.scheduler = scheduler
  }

  /**
   * Process a scheduled task as an agent invocation.
   * Called by Scheduler — same flow as processing a message.
   */
  async processScheduledTask(task: ScheduledTask): Promise<void> {
    const group = this.groups.get(task.chatId)
    if (!group) {
      logger.warn({ taskId: task.id, chatId: task.chatId }, 'Scheduled task: group not found')
      return
    }
    // Synthesize a message and process through the same pipeline
    this.db.storeMessage({
      id: `task-${task.id}-${Date.now()}`,
      chatId: task.chatId,
      sender: 'scheduler',
      senderName: 'Scheduled Task',
      content: task.prompt,
      timestamp: new Date().toISOString(),
      isFromMe: false,
      isBotMessage: false,
      channel: group.channel,
    })
    await this.processGroup(task.chatId, group, 'scheduler')
  }

  /**
   * Route permission "ask" to the main group channel when the
   * originating channel doesn't support interactive ask.
   */
  async askViaMainGroup(
    chatId: string, groupName: string, tool: string, args: unknown, actor: string
  ): Promise<{ approved: boolean; scope: 'once' | 'session' | 'always' }> {
    const mainGroup = Object.values(this.groups.getAll()).find(g => g.isMain)
    if (!mainGroup) {
      logger.warn('No main group configured — denying permission ask')
      return { approved: false, scope: 'once' }
    }
    const mainChannel = this.findChannel(mainGroup.chatId)
    if (!mainChannel?.askPermission) {
      logger.warn('Main channel does not support askPermission — denying')
      return { approved: false, scope: 'once' }
    }
    return mainChannel.askPermission(
      mainGroup.chatId,
      tool,
      args,
      {
        title: `Permission request from ${groupName} (${chatId})`,
        requester: actor,
      },
    )
  }

  async start(channelDefs: Map<string, ChannelDefinition>, tools: ToolDefinition[]): Promise<void> {
    this.channelDefs = channelDefs
    this.customTools = tools

    // Connect all channels
    for (const [name, def] of channelDefs) {
      try {
        const env: Record<string, string> = {}
        for (const key of def.requiredEnv) {
          env[key] = process.env[key]!
        }

        const connected = await def.connect({
          env,
          inbound: (msg) => this.handleInbound(name, msg),
          onChatMetadata: (chatId, chatName, isGroup) => {
            this.db.storeChatMetadata(chatId, new Date().toISOString(), chatName, name, isGroup)
          },
          splitMessage: (text, maxLen) => splitText(text, maxLen),
          logger: logger.child({ channel: name }),
        })

        this.channels.set(name, connected)
        await this.bus.emit('channel.connected', { channel: name })
        logger.info({ channel: name }, 'Channel connected')
      } catch (err) {
        logger.error({ channel: name, err }, 'Failed to connect channel')
        await this.bus.emit('channel.error', { channel: name, error: err as Error })
      }
    }

    if (this.channels.size === 0) {
      logger.fatal('No channels connected. Exiting.')
      process.exit(1)
    }

    // Start message loop
    this.running = true
    this.messageLoop()

    await this.bus.emit('app.start', { channels: [...this.channels.keys()] })
    logger.info({ channels: [...this.channels.keys()] }, 'Orchestrator started')
  }

  private async handleInbound(channelName: string, msg: InboundMessage): Promise<void> {
    const intercepted = await this.plugins.applyMessageInterceptors({
      chatId: msg.chatId,
      sender: msg.sender,
      content: msg.content,
      channel: channelName,
    })
    if (intercepted.action === 'deny') {
      logger.warn({ chatId: msg.chatId, reason: intercepted.reason }, 'Inbound message denied by plugin')
      return
    }

    const effectiveMsg = {
      ...msg,
      content: intercepted.content,
    }

    // Store message
    this.db.storeMessage({
      id: effectiveMsg.messageId || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      chatId: effectiveMsg.chatId,
      sender: effectiveMsg.sender,
      senderName: effectiveMsg.senderName,
      content: effectiveMsg.content,
      timestamp: effectiveMsg.timestamp.toISOString(),
      isFromMe: effectiveMsg.isFromMe || false,
      channel: channelName,
    })

    await this.bus.emit('message.inbound', {
      channel: channelName,
      chatId: effectiveMsg.chatId,
      sender: effectiveMsg.senderName,
      content: effectiveMsg.content,
    })
  }

  private messageLoop(): void {
    const poll = async () => {
      if (!this.running) return

      try {
        const groups = this.groups.getAll()
        const jids = Object.keys(groups)

        // Get new messages since last check (monotonic seq cursor — never loses messages)
        const lastSeq = parseInt(this.db.getState('last_seq') || '0', 10)
        const { messages, lastSeq: newSeq } = this.db.getNewMessages(
          jids,
          lastSeq,
          this.config.name,
        )

        if (messages.length > 0) {
          this.db.setState('last_seq', String(newSeq))

          // Group messages by chatId
          const byChat = new Map<string, typeof messages>()
          for (const msg of messages) {
            const existing = byChat.get(msg.chatId) || []
            existing.push(msg)
            byChat.set(msg.chatId, existing)
          }

          // Process each group
          for (const [chatId, chatMessages] of byChat) {
            const group = groups[chatId]
            if (!group) continue

            // Trigger check
            if (group.requiresTrigger) {
              const triggerRegex = new RegExp(`^${escapeRegex(this.config.trigger)}\\b`, 'i')
              const hasTrigger = chatMessages.some(m => triggerRegex.test(m.content.trim()))
              if (!hasTrigger) continue
            }

            // Don't start a new agent if one is already running for this group
            if (this.activeAgents.has(chatId)) {
              // TODO: queue or pipe message to running agent (steering)
              continue
            }

            // Process in background (don't block the poll loop)
            this.processGroup(chatId, group, 'agent').catch(err => {
              logger.error({ chatId, err }, 'Error processing group')
            })
          }
        }
      } catch (err) {
        logger.error({ err }, 'Error in message loop')
      }

      setTimeout(poll, this.config.pollInterval)
    }

    poll()
  }

  private async processGroup(chatId: string, group: GroupInfo, actor: string): Promise<void> {
    const channel = this.findChannel(chatId)
    if (!channel) {
      logger.warn({ chatId }, 'No channel owns this chatId')
      return
    }

    // Get all pending messages (using monotonic seq cursor)
    const lastAgentSeq = parseInt(this.db.getState(`last_agent_seq_${chatId}`) || '0', 10)
    const pendingMessages = this.db.getMessagesSince(chatId, lastAgentSeq, this.config.name)
    if (pendingMessages.length === 0) return

    logger.info({ group: group.name, messageCount: pendingMessages.length }, 'Processing group')

    // Reserve the group slot before the first await to avoid duplicate
    // agents for the same chat when the poll loop ticks again.
    const abortController = new AbortController()
    this.activeAgents.set(chatId, { cancel: () => abortController.abort() })

    try {
      // Show typing indicator
      try {
        await channel.setTyping?.(chatId, true)
      } catch (err) {
        logger.warn({ chatId, err }, 'Failed to enable typing indicator')
      }

      // Build tools: pi-mono built-in + custom + permission wrapping
      const workingDir = this.groups.getWorkingDir(group.folder)

      // CRITICAL: All built-in tools receive workingDir so they operate
      // within the group's isolated directory. In mode:'none' (no container),
      // this is the ONLY isolation boundary — tools MUST respect it.
      const builtInTools = [
        createReadTool({ workingDir }),
        createWriteTool({ workingDir }),
        createEditTool({ workingDir }),
        createBashTool({ workingDir }),       // cwd = workingDir, rejects cd outside
        createGrepTool({ workingDir }),
        createFindTool({ workingDir }),
        createLsTool({ workingDir }),
      ]

      // Session management — SessionManager is the conversation authority
      const sessionPath = this.groups.getSessionPath(group.folder)
      const sessionManager = new SessionManager(sessionPath)
      const existingSessionId = this.db.getSession(group.folder)
      const sessionId = existingSessionId || sessionManager.create()
      this.db.setSession(group.folder, sessionId)
      if (!existingSessionId) {
        await this.bus.emit('session.created', {
          sessionId,
          chatId,
          groupFolder: group.folder,
        })
      }

      const permCtx: PermissionContext = {
        groupId: chatId,
        sessionId,
        actor,
      }
      const customToolCtx = {
        sessionId,
        chatId,
        workingDir,
        sendMessage: async (text: string) => {
          await channel.send(chatId, text)
          this.db.storeMessage({
            id: `tool-out-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            chatId,
            sender: this.config.name,
            senderName: this.config.name,
            content: text,
            timestamp: new Date().toISOString(),
            isFromMe: true,
            isBotMessage: true,
            channel: group.channel,
          })
          await this.bus.emit('message.outbound', { channel: group.channel, chatId, content: text })
        },
      }
      const customAgentTools = this.customTools.map(t => toAgentTool(t, customToolCtx))
      const allTools = [...builtInTools, ...customAgentTools]

      // Wrap with permissions — askFn MUST go through main group channel
      // when the originating channel doesn't support interactive ask.
      const askFn = channel.askPermission
        ? (tool: string, args: unknown) => channel.askPermission!(chatId, tool, args, {
            title: `Permission request in ${group.name}`,
            requester: actor,
          })
        : (tool: string, args: unknown) => this.askViaMainGroup(chatId, group.name, tool, args, actor)

      const wrappedTools = wrapToolsWithPermissions(
        allTools,
        this.permissions,
        this.bus,
        askFn,
        permCtx,
        this.plugins,
      )

      // Build system prompt with memory
      const memory = this.groups.readMemory(group.folder)
      const systemPrompt = this.buildSystemPrompt(group, memory)

      // Append new inbound messages to the session
      for (const msg of pendingMessages) {
        sessionManager.addMessage(sessionId, {
          role: 'user',
          content: `[${msg.senderName}] ${msg.content}`,
        })
      }

      // Create pi-mono Agent with SessionManager
      const agent = new Agent({
        model: this.resolveModel(),
        tools: wrappedTools,
        systemPrompt,
        sessionManager,
        sessionId,
        maxTurns: this.config.agent.maxTurns,
      })
      const agentStartedAt = Date.now()

      // Subscribe to agent events → bridge to EventBus
      agent.subscribe(async (event) => {
        switch (event.type) {
          case 'agent_start':
            await this.bus.emit('agent.start', { sessionId, chatId })
            break
          case 'agent_end':
            await this.bus.emit('agent.end', {
              sessionId,
              chatId,
              durationMs: Date.now() - agentStartedAt,
            })
            break
          case 'message_end':
            // Agent produced final output — send to channel AND store in SQLite
            if (event.message.role === 'assistant' && event.message.content) {
              const text = typeof event.message.content === 'string'
                ? event.message.content
                : event.message.content.map((c: any) => c.text || '').join('')
              if (text.trim()) {
                await channel.send(chatId, text)
                // Store outbound message so SQLite has complete conversation history
                this.db.storeMessage({
                  id: `out-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                  chatId,
                  sender: this.config.name,
                  senderName: this.config.name,
                  content: text,
                  timestamp: new Date().toISOString(),
                  isFromMe: true,
                  isBotMessage: true,
                  channel: group.channel,
                })
                await this.bus.emit('message.outbound', { channel: group.channel, chatId, content: text })
              }
            }
            break
        }
      })

      // Run the agent loop (SessionManager handles conversation context)
      try {
        await agent.agentLoop()
      } catch (err) {
        logger.error({ chatId, group: group.name, err }, 'Agent error')
      } finally {
        // Update cursor (seq is monotonic — no lost messages)
        const lastMsg = pendingMessages[pendingMessages.length - 1]
        this.db.setState(`last_agent_seq_${chatId}`, String(lastMsg.seq))
      }
    } finally {
      this.activeAgents.delete(chatId)
      try {
        await channel.setTyping?.(chatId, false)
      } catch (err) {
        logger.warn({ chatId, err }, 'Failed to clear typing indicator')
      }
    }
  }

  private buildSystemPrompt(group: GroupInfo, memory: string): string {
    const parts = [
      `You are ${this.config.name}, a personal AI assistant.`,
      `You are in the "${group.name}" chat group.`,
      group.isMain ? 'This is the main control group. You have elevated privileges.' : '',
      '',
      memory ? `## Memory\n\n${memory}` : '',
      '',
      'When asked to remember something, write it to CLAUDE.md in the current directory.',
    ]
    return parts.filter(Boolean).join('\n')
  }

  private findChannel(chatId: string): ConnectedChannel | undefined {
    for (const [name, ch] of this.channels) {
      if (ch.ownsChat(chatId)) return ch
    }
    return undefined
  }

  private resolveModel() {
    // Resolve from pi-mono's model registry
    // This returns the model config that pi-ai understands
    return {
      providerId: this.config.provider.default,
      modelId: this.config.provider.model,
    }
  }

  async stop(): Promise<void> {
    this.running = false
    for (const [name, ch] of this.channels) {
      await ch.disconnect()
      logger.info({ channel: name }, 'Channel disconnected')
    }
    await this.bus.emit('app.stop', { reason: 'shutdown' })
  }
}
```

---

## 12. Module 8: Storage

### 12.1 Purpose

SQLite database for messages, groups, tasks, and framework state. Provides fast querying for the message loop and scheduler.

### 12.2 Schema

See [Appendix B](#appendix-b-sqlite-schema) for the complete SQL schema. Summary:

| Table | Purpose |
|-------|---------|
| `messages` | Inbound/outbound message history |
| `chats` | Chat metadata (names, last activity) |
| `groups` | Registered group configuration |
| `tasks` | Scheduled tasks |
| `task_runs` | Task execution history |
| `state` | Key-value state (timestamps, cursors) |
| `sessions` | Session IDs per group |

### 12.3 Interface

```typescript
// framework/storage.ts

export class Storage {
  constructor(dbPath: string)

  // Messages — cursor is monotonic `seq`, not timestamp
  storeMessage(msg: StoredMessage): number  // returns seq
  getNewMessages(chatIds: string[], sinceSeq: number, botName: string): { messages: StoredMessage[]; lastSeq: number }
  getMessagesSince(chatId: string, sinceSeq: number, botName: string): StoredMessage[]

  // Chat metadata
  storeChatMetadata(chatId: string, timestamp: string, name?: string, channel?: string, isGroup?: boolean): void
  getAllChats(): ChatInfo[]

  // Groups
  setGroup(info: GroupInfo): void
  getGroup(chatId: string): GroupInfo | undefined
  getAllGroups(): Record<string, GroupInfo>
  removeGroup(chatId: string): void

  // Tasks
  createTask(task: ScheduledTask): void
  getTaskById(id: string): ScheduledTask | undefined
  getDueTasks(): ScheduledTask[]
  updateTask(id: string, updates: Partial<ScheduledTask>): void
  deleteTask(id: string): void
  getAllTasks(): ScheduledTask[]
  logTaskRun(log: TaskRunLog): void

  // State (key-value)
  getState(key: string): string | undefined
  setState(key: string, value: string): void

  // Sessions
  getSession(groupFolder: string): string | undefined
  setSession(groupFolder: string, sessionId: string): void
}
```

---

## 13. Module 9: Scheduler

### 13.1 Purpose

Run tasks at scheduled times. Tasks are full agent invocations — the AI can use all its tools when executing a scheduled task.

### 13.2 Schedule Types

| Type | Format | Example |
|------|--------|---------|
| `cron` | Cron expression | `0 9 * * 1-5` (weekdays at 9am) |
| `interval` | Milliseconds | `3600000` (every hour) |
| `once` | ISO timestamp | `2026-03-10T09:00:00Z` |

### 13.3 Task Data Model

```typescript
export interface ScheduledTask {
  id: string
  groupFolder: string
  chatId: string
  prompt: string
  scheduleType: 'cron' | 'interval' | 'once'
  scheduleValue: string
  nextRun: string | null
  lastRun: string | null
  status: 'active' | 'paused' | 'completed'
  createdAt: string
}
```

### 13.4 Scheduler Loop

```typescript
// framework/scheduler.ts

export class Scheduler {
  private running = false

  constructor(
    private db: Storage,
    private orchestrator: Orchestrator,
    private config: AppConfig,
    private bus: EventBus,
  ) {}

  schedule(task: ScheduledTask): void {
    this.db.createTask(task)
    void this.bus.emit('task.scheduled', {
      taskId: task.id,
      chatId: task.chatId,
      scheduleType: task.scheduleType,
      scheduleValue: task.scheduleValue,
    })
  }

  start(): void {
    this.running = true
    this.loop()
  }

  private async loop(): Promise<void> {
    while (this.running) {
      try {
        const dueTasks = this.db.getDueTasks()
        for (const task of dueTasks) {
          await this.runTask(task)
        }
      } catch (err) {
        logger.error({ err }, 'Scheduler loop error')
      }
      await sleep(this.config.schedulerInterval)
    }
  }

  private async runTask(task: ScheduledTask): Promise<void> {
    const startTime = Date.now()

    try {
      // Run the task as an agent invocation (same as processing a message)
      await this.orchestrator.processScheduledTask(task)

      // Compute next run
      const nextRun = computeNextRun(task, this.config.timezone)
      this.db.updateTask(task.id, {
        nextRun,
        lastRun: new Date().toISOString(),
        status: nextRun ? 'active' : 'completed',
      })
      this.db.logTaskRun({
        taskId: task.id,
        runAt: new Date().toISOString(),
        durationMs: Date.now() - startTime,
        status: 'success',
      })
      await this.bus.emit('task.executed', {
        taskId: task.id,
        durationMs: Date.now() - startTime,
        success: true,
      })
    } catch (err) {
      logger.error({ taskId: task.id, err }, 'Task execution failed')
      this.db.logTaskRun({
        taskId: task.id,
        runAt: new Date().toISOString(),
        durationMs: Date.now() - startTime,
        status: 'error',
        error: String(err),
      })
      await this.bus.emit('task.failed', {
        taskId: task.id,
        error: String(err),
      })
    }
  }

  stop(): void {
    this.running = false
  }
}

export function computeNextRun(task: ScheduledTask, timezone: string): string | null {
  if (task.scheduleType === 'once') return null

  if (task.scheduleType === 'cron') {
    const interval = CronExpressionParser.parse(task.scheduleValue, { tz: timezone })
    return interval.next().toISOString()
  }

  if (task.scheduleType === 'interval') {
    const ms = parseInt(task.scheduleValue, 10)
    let next = new Date(task.nextRun!).getTime() + ms
    while (next <= Date.now()) next += ms
    return new Date(next).toISOString()
  }

  return null
}
```

---

## 14. Module 10: Plugin System

### 14.1 Purpose

Plugins extend the framework without modifying core code. Two interfaces are provided:
- **Observe**: Subscribe to events (read-only, for logging/analytics/monitoring)
- **Intercept**: Register hooks that can **allow**, **deny**, or **transform** operations (policy/middleware)

### 14.2 Plugin Definition API

```typescript
// framework/plugin.ts

import fs from 'fs'
import path from 'path'
import type { Logger } from 'pino'
import type { EventBus, EventHandler } from './event-bus.js'
import type { AppConfig } from './config.js'
import type { EventMap } from './types.js'

export interface PluginDefinition {
  /** Unique plugin name */
  name: string

  /** Setup function — called once at startup.
   *  Receives the PluginAPI for registering hooks and accessing framework services.
   */
  setup: (api: PluginAPI) => void | Promise<void>
}

/**
 * Tool interceptors can deny or transform args before permission evaluation.
 * `allow` means "stop interceptor chaining and continue normally" — it does
 * NOT bypass the permission engine.
 */
export type ToolInterceptVerdict =
  | { action: 'allow' }
  | { action: 'deny'; reason: string }
  | { action: 'transform'; args: Record<string, unknown> }  // modified args

/**
 * Message interceptors can deny an inbound message or transform its content
 * before it is written to SQLite and seen by the agent.
 */
export type MessageInterceptVerdict =
  | { action: 'allow' }
  | { action: 'deny'; reason: string }
  | { action: 'transform'; content: string }

export type ToolInterceptor = (ctx: {
  tool: string
  args: Record<string, unknown>
  groupId: string
  actor: string
}) => ToolInterceptVerdict | undefined | Promise<ToolInterceptVerdict | undefined>

export type MessageInterceptor = (ctx: {
  chatId: string
  sender: string
  content: string
  channel: string
}) => MessageInterceptVerdict | undefined | Promise<MessageInterceptVerdict | undefined>

export interface PluginAPI {
  // ─── Observe (read-only event subscription) ───

  /** Subscribe to a specific event (observation only, cannot block) */
  on<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): () => void

  /** Subscribe to all events (for audit logging) */
  onAll(handler: (event: string, data: unknown) => void | Promise<void>): () => void

  /** Emit a custom event */
  emit(event: string, data: unknown): Promise<void>

  // ─── Intercept (policy/middleware hooks) ───

  /**
   * Register a tool execution interceptor.
   * Called BEFORE permission check. Can deny or transform tool calls.
   * Multiple interceptors run in registration order; first deny wins.
   */
  interceptTool(handler: ToolInterceptor): () => void

  /**
   * Register a message interceptor.
   * Called BEFORE the agent processes inbound messages.
   * Can deny (drop message) or transform (modify content).
   */
  interceptMessage(handler: MessageInterceptor): () => void

  // ─── Utilities ───

  /** Access the logger */
  logger: Logger

  /** Resolve a path relative to the project root */
  resolvePath(...segments: string[]): string

  /** Append text to a file (for audit logs) */
  appendFile(filePath: string, content: string): Promise<void>

  /** Access config (read-only) */
  config: Readonly<AppConfig>
}

/** Helper for type-safe plugin definition */
export function definePlugin(def: PluginDefinition): PluginDefinition {
  return def
}

/**
 * Runtime registry that powers PluginAPI and applies interceptor chains
 * inside the actual message/tool pipelines.
 */
export class PluginRuntime {
  private toolInterceptors = new Set<ToolInterceptor>()
  private messageInterceptors = new Set<MessageInterceptor>()

  constructor(
    private bus: EventBus,
    private config: AppConfig,
    private rootDir: string,
    private logger: Logger,
  ) {}

  createAPI(pluginName: string): PluginAPI {
    const pluginLogger = this.logger.child({ plugin: pluginName })

    return {
      on: this.bus.on.bind(this.bus),
      onAll: this.bus.onAll.bind(this.bus),
      emit: this.bus.emit.bind(this.bus),
      interceptTool: (handler) => {
        this.toolInterceptors.add(handler)
        return () => this.toolInterceptors.delete(handler)
      },
      interceptMessage: (handler) => {
        this.messageInterceptors.add(handler)
        return () => this.messageInterceptors.delete(handler)
      },
      logger: pluginLogger,
      resolvePath: (...segments) => path.join(this.rootDir, ...segments),
      appendFile: (filePath, content) => fs.promises.appendFile(filePath, content),
      config: this.config,
    }
  }

  async applyToolInterceptors(ctx: {
    tool: string
    args: Record<string, unknown>
    groupId: string
    actor: string
  }): Promise<
    | { action: 'continue'; args: Record<string, unknown> }
    | { action: 'deny'; reason: string }
  > {
    let currentArgs = ctx.args

    for (const handler of this.toolInterceptors) {
      const verdict = await handler({ ...ctx, args: currentArgs })
      if (!verdict) continue
      if (verdict.action === 'deny') return verdict
      if (verdict.action === 'transform') {
        currentArgs = verdict.args
        continue
      }
      if (verdict.action === 'allow') break
    }

    return { action: 'continue', args: currentArgs }
  }

  async applyMessageInterceptors(ctx: {
    chatId: string
    sender: string
    content: string
    channel: string
  }): Promise<
    | { action: 'continue'; content: string }
    | { action: 'deny'; reason: string }
  > {
    let currentContent = ctx.content

    for (const handler of this.messageInterceptors) {
      const verdict = await handler({ ...ctx, content: currentContent })
      if (!verdict) continue
      if (verdict.action === 'deny') return verdict
      if (verdict.action === 'transform') {
        currentContent = verdict.content
        continue
      }
      if (verdict.action === 'allow') break
    }

    return { action: 'continue', content: currentContent }
  }
}
```

### 14.3 Plugin Examples

#### Audit Log Plugin

```typescript
// plugins/audit-log.ts
import { definePlugin } from '../framework/plugin.js'

export default definePlugin({
  name: 'audit-log',

  setup(api) {
    const logFile = api.resolvePath('logs', 'audit.jsonl')

    api.onAll(async (event, data) => {
      // Skip high-frequency events
      if (event === 'agent.text_delta') return

      const entry = JSON.stringify({
        time: new Date().toISOString(),
        event,
        data,
      })

      await api.appendFile(logFile, entry + '\n')
    })

    api.logger.info({ logFile }, 'Audit log plugin initialized')
  },
})
```

#### Rate Limit Plugin (uses intercept)

```typescript
// plugins/rate-limit.ts
import { definePlugin } from '../framework/plugin.js'

export default definePlugin({
  name: 'rate-limit',

  setup(api) {
    const windowMs = 60_000
    const maxCalls = 30
    const callLog = new Map<string, number[]>()

    // Use interceptTool to actually BLOCK excessive calls
    api.interceptTool(({ tool }) => {
      const now = Date.now()
      const calls = (callLog.get(tool) || []).filter(t => now - t < windowMs)

      if (calls.length >= maxCalls) {
        api.logger.warn({ tool, calls: calls.length }, 'Rate limit exceeded — denying')
        return { action: 'deny', reason: `Rate limit exceeded: ${calls.length}/${maxCalls} calls in ${windowMs}ms` }
      }

      calls.push(now)
      callLog.set(tool, calls)
      return undefined  // no opinion — pass through
    })
  },
})
```

#### Content Guard Plugin (uses intercept)

```typescript
// plugins/content-guard.ts
import { definePlugin } from '../framework/plugin.js'

export default definePlugin({
  name: 'content-guard',

  setup(api) {
    // Block tool calls with suspicious args
    api.interceptTool(({ tool, args }) => {
      if (tool === 'bash') {
        const cmd = (args as { command?: string }).command || ''
        if (/rm\s+-rf\s+\//.test(cmd)) {
          return { action: 'deny', reason: 'Dangerous command blocked by content-guard' }
        }
      }
      return undefined
    })

    // Transform inbound messages (e.g., strip PII before agent sees them)
    api.interceptMessage(({ content }) => {
      // Example: redact credit card numbers
      const redacted = content.replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[REDACTED-CC]')
      if (redacted !== content) {
        return { action: 'transform', content: redacted }
      }
      return undefined
    })
  },
})
```

### 14.4 Plugin Runtime Wiring

Plugins are not just loaded; they are wired into the runtime pipelines through `PluginRuntime`:

```typescript
// framework/core.ts

const pluginRuntime = new PluginRuntime(bus, config, rootDir, logger)

for (const plugin of plugins) {
  await plugin.setup(pluginRuntime.createAPI(plugin.name))
}

const orchestrator = new Orchestrator(
  config,
  bus,
  permissions,
  groups,
  storage,
  pluginRuntime,
)
```

This is what closes the loop:

- `handleInbound()` calls `pluginRuntime.applyMessageInterceptors()` before storing a message.
- `wrapToolsWithPermissions()` calls `pluginRuntime.applyToolInterceptors()` before permission evaluation.
- Plugins therefore operate on real traffic, not just on paper.

### 14.5 Plugin Auto-Scanning

Same pattern as tools and channels:

```typescript
// framework/plugin-loader.ts

export async function scanPlugins(pluginsDir: string): Promise<PluginDefinition[]> {
  if (!fs.existsSync(pluginsDir)) return []

  const files = fs.readdirSync(pluginsDir).filter(f => f.endsWith('.ts') || f.endsWith('.js'))
  const plugins: PluginDefinition[] = []

  for (const file of files) {
    try {
      const mod = await import(path.join(pluginsDir, file))
      const def = mod.default as PluginDefinition
      if (def?.name && def?.setup) {
        plugins.push(def)
        logger.info({ plugin: def.name }, 'Plugin loaded')
      }
    } catch (err) {
      logger.error({ file, err }, 'Failed to load plugin')
    }
  }

  return plugins
}
```

---

## 15. Module 11: Container Isolation (Optional)

### 15.1 Purpose

Run agents in isolated Linux containers so that even if the AI does something unexpected (due to prompt injection, bugs, or adversarial input), it cannot affect the host system.

### 15.2 When to Use

| Isolation Mode | When | Trade-off |
|---------------|------|-----------|
| `none` | Development, trusted environments | Fastest, no overhead |
| `process` | Light isolation | Separate process, shared filesystem |
| `container` | Production, untrusted inputs | Full OS-level isolation, slower startup |

### 15.3 Container Architecture (borrowed from NanoClaw)

```
Host Process                      Container (Linux VM)
┌───────────────┐                ┌──────────────────────┐
│ Orchestrator  │   stdin/JSON   │ Agent Runner          │
│               │───────────────▶│                       │
│               │                │ pi-coding-agent       │
│               │   stdout/JSON  │ + tools               │
│               │◀───────────────│ + CLAUDE.md context   │
│               │                │                       │
│ Mount:        │                │ /workspace/group/     │
│ groups/{name} │───── bind ────▶│ (working directory)   │
│               │                │                       │
│ Mount:        │                │ /workspace/global/    │
│ groups/global │───── bind(ro)─▶│ (global memory)       │
│               │                │                       │
└───────────────┘                └──────────────────────┘
```

### 15.4 Security Boundaries

| Resource | Host | Container |
|----------|------|-----------|
| Filesystem | Full access | Only mounted dirs |
| Network | Full access | Full access (or none with --network=none) |
| Processes | All | Container only |
| Secrets | .env file | Passed via stdin, not mounted |
| Project code | Full | Read-only mount (optional) |

Container isolation is an advanced feature. Phase 1-2 use `mode: 'none'` (in-process). Phase 3 adds container support.

---

## 16. Startup Sequence

```
createApp({ root })
│
├─ 1. loadConfig(root)
│     Parse config/app.ts + env overrides + validate with Zod
│
├─ 2. new EventBus()
│
├─ 3. loadPermissions(root)
│     Parse config/permissions.yml + config/overrides.yml → PermissionEngine
│
├─ 4. new Storage(store/main.db)
│     Create/migrate SQLite schema
│
├─ 5. new GroupManager(root, storage, bus)
│     Load registered groups from SQLite
│
├─ 6. scanTools(root/tools)
│     Auto-discover tool definitions
│
├─ 7. scanChannels(root/channels, env)
│     Auto-discover channel definitions, check env vars
│
├─ 8. scanPlugins(root/plugins)
│     Auto-discover plugin definitions
│
├─ 9. new PluginRuntime(bus, config, root, logger)
│     Owns message/tool interceptor registries
│
├─ 10. Initialize plugins
│      Call plugin.setup(pluginRuntime.createAPI(name)) for each plugin
│
├─ 11. new Orchestrator(config, bus, permissions, groups, storage, pluginRuntime)
│
├─ 12. new Scheduler(storage, orchestrator, config, bus)
│      orchestrator.setScheduler(scheduler)  ← lazy injection
│
├─ 13. orchestrator.start(channels, tools)
│      Connect all channels
│      Start message polling loop
│      Emit `app.start`
│
├─ 14. scheduler.start()
│
├─ 15. Register shutdown handlers
│      SIGTERM/SIGINT → graceful shutdown
│
└─ DONE
```

---

## 17. Message Lifecycle — End-to-End

Complete trace of a single user message from arrival to response:

```
──────────── STEP 1: INBOUND ────────────

User sends "@Andy what's the weather in Beijing?"
  via Telegram group chat

Telegram Channel receives message
  → ctx.inbound({
      chatId: "tg:-100123456",
      sender: "user123",
      senderName: "张三",
      content: "@Andy what's the weather in Beijing?",
      isGroup: true,
      timestamp: 2026-03-09T10:00:00Z
    })

──────────── STEP 2: STORE ────────────

Orchestrator.handleInbound()
  → pluginRuntime.applyMessageInterceptors(msg)
  → storage.storeMessage(transformedMsg)
  → bus.emit('message.inbound', {...})

──────────── STEP 3: POLL ────────────

Message loop (every 2 seconds):
  → storage.getNewMessages(['tg:-100123456'], lastSeq=41)
  → Found 1 new message

──────────── STEP 4: TRIGGER CHECK ────────────

Group "tg_family" has requiresTrigger: true
  → Does "@Andy what's the weather..." match /^@Andy\b/i ?
  → YES ✓

──────────── STEP 5: BUILD CONTEXT ────────────

Load pending inbound messages from SQLite since `last_agent_seq=41`:
  [seq=42] 张三: @Andy what's the weather in Beijing?

Append pending messages to SessionManager:
  session.jsonl += { role: 'user', content: '[张三] @Andy what...' }

Load memory:
  groups/global/CLAUDE.md → "User prefers Chinese responses."
  groups/tg_family/CLAUDE.md → "Family group. Members: 张三, 李四."

Build system prompt:
  "You are Andy, a personal AI assistant.
   You are in the 'Family' chat group.

   ## Memory
   User prefers Chinese responses.
   Family group. Members: 张三, 李四."

──────────── STEP 6: PREPARE TOOLS ────────────

Built-in tools (pi-mono):
  read, write, edit, bash, grep, find, ls

Custom tools (from tools/):
  web_search, send_message

Wrap ALL tools with permissions:
  web_search → permissions.evaluate("web_search", {...}) → "allow" (direct execute)
  bash → permissions.evaluate("bash", {...}) → "ask" (pause for user)
  read → permissions.evaluate("read", {...}) → "allow"

──────────── STEP 7: AGENT LOOP ────────────

Create pi-mono Agent with:
  - sessionManager = groups/tg_family/session.jsonl
  - sessionId = "s1"
  - systemPrompt = [memory + role instructions]
  - tools = [wrapped tools]

Agent reads conversation context from SessionManager
Agent sees the newly appended user message in session "s1"

Agent decides to call web_search({query: "Beijing weather today"})

──────────── STEP 8: PERMISSION CHECK ────────────

web_search → permission rule: allow
  → bus.emit('tool.before', {tool: 'web_search', groupId: 'tg:-100123456', sessionId: 's1', ...})
  → Execute immediately
  → bus.emit('tool.after', {tool: 'web_search', durationMs: 1200, sessionId: 's1', ...})

Agent gets search results
Agent produces response:
  "北京今天天气晴，气温15°C，微风。适合外出！"

──────────── STEP 9: OUTBOUND ────────────

Agent event: message_end (role: assistant)
  → Extract text
  → channel.send("tg:-100123456", "北京今天天气晴，气温15°C，微风。适合外出！")
  → storage.storeMessage(outbound assistant message)
  → bus.emit('message.outbound', {...})

──────────── STEP 10: UPDATE CURSOR ────────────

storage.setState('last_agent_seq_tg:-100123456', '42')  // monotonic seq, never loses messages

──────────── DONE ────────────
```

---

## 18. Session and Memory Model

### 18.1 Session Architecture — Split Authority

The framework uses **two stores with clear, non-overlapping responsibilities**:

| Store | Responsibility | Authoritative For |
|-------|---------------|-------------------|
| **SQLite `messages` table** | Message routing, trigger detection, admin queries | "Which chats have new messages?", "Show me message history" |
| **pi-mono `SessionManager` (JSONL)** | Agent conversation state, compaction, tool call history | "What does the AI remember?", "Resume conversation" |

**Data flow** (intentional dual-write, different authority):
1. Inbound message arrives → plugins may transform/deny it → accepted message is written to SQLite `messages`
2. When that group is processed, pending inbound messages are appended to SessionManager JSONL
3. Agent runs → SessionManager manages the conversation turns, tool calls, compaction
4. Agent produces output → sent to channel and written to SQLite `messages`
5. Message polling loop reads from SQLite to detect new messages (routing)
6. Agent context is built from SessionManager (conversation continuity), NOT from SQLite

**Why not just one?**
- SQLite is needed for fast indexed queries across all groups (the polling loop)
- SessionManager is needed for pi-mono's compaction, branching, and context management
- They serve different purposes and don't compete

```
                    SQLite                     SessionManager
                ┌──────────────┐           ┌──────────────────┐
  inbound msg → │ messages     │           │ session.jsonl     │
                │ (routing)    │           │ (conversation)    │
                └──────────────┘           └──────────────────┘
                      ↓                          ↓
              polling loop reads           pending inbound msgs appended
              "any new messages?"          before agent runs
                                                 ↓
                                           agent.agentLoop() reads
                                           "conversation history + compaction"
                                                 ↓
                                           agent response
                                                 ↓
              SQLite ← storeMessage()      SessionManager ← auto-appended
```

### 18.2 SessionManager Integration

Each group has a persistent session powered by pi-mono's `SessionManager`:

- **Conversation continuity**: AI remembers what you talked about
- **JSONL format**: Human-readable, `cat`-able, `grep`-able
- **Tree structure**: Support for branching and compaction

```
groups/tg_family/session.jsonl:

{"type":"session","id":"s1","created":"2026-03-09T10:00:00Z"}
{"type":"message","id":"m1","parentId":"s1","role":"user","content":"@Andy what's the weather?"}
{"type":"tool_call","id":"t1","parentId":"m1","tool":"web_search","args":{"query":"Beijing weather"}}
{"type":"message","id":"m2","parentId":"t1","role":"assistant","content":"北京今天天气晴..."}
{"type":"compaction","id":"c1","parentId":"m2","summary":"User asked about weather, assistant searched and responded."}
```

The Orchestrator creates the Agent with SessionManager, NOT by manually querying SQLite and formatting messages:

```typescript
// In processGroup():
const sessionPath = this.groups.getSessionPath(group.folder)
const sessionManager = new SessionManager(sessionPath)
const sessionId = this.db.getSession(group.folder) || sessionManager.create()
this.db.setSession(group.folder, sessionId)

// Append new inbound messages to the session
for (const msg of pendingMessages) {
  sessionManager.addMessage(sessionId, {
    role: 'user',
    content: `[${msg.senderName}] ${msg.content}`,
  })
}

// Agent uses SessionManager for its conversation context
const agent = new Agent({
  model: this.resolveModel(),
  tools: wrappedTools,
  systemPrompt,
  sessionManager,
  sessionId,
  maxTurns: this.config.agent.maxTurns,
})
```

### 18.3 Memory Model

| Level | File | Readable By | Writable By |
|-------|------|-------------|-------------|
| Global | `groups/global/CLAUDE.md` | All groups | Main group only |
| Group | `groups/{folder}/CLAUDE.md` | That group | That group |

### 18.4 Context Compaction

When conversation history exceeds the model's context window:

1. pi-mono's `transformContext()` is called
2. Older messages are summarized
3. Summary is stored as a `compaction` entry in the session
4. Future turns see: `[past summaries] + [recent messages]`

This is handled by pi-coding-agent automatically when `config.agent.compaction.auto: true`.
When pi-mono surfaces a compaction callback/event, the framework bridges it to `session.compacted` on the EventBus for audit/metrics consumers.

---

## 19. Bootstrap & Admin Flow

### 19.1 Purpose

This section defines how the system bootstraps from zero to operational, how the admin (you) manages groups, and how cross-channel permission asks work. This is the "control plane" — separate from the agent's "data plane".

### 19.2 First-Time Bootstrap

```
1. User installs the framework and runs `npm run dev`
2. CLI channel is always available (no env vars required)
3. CLI session is automatically the "main" group with elevated privileges
4. User configures a messaging channel (e.g., adds TELEGRAM_BOT_TOKEN to .env)
5. Restart → Telegram channel auto-connects
6. User sends a message in a Telegram group
7. Message arrives in SQLite but group is NOT registered → message is ignored
8. Admin sees unregistered chats via CLI:

   > @Andy show pending chats
   Pending chats (not yet registered):
   1. tg:-100123456 "Family Group" (3 messages)
   2. tg:-100789012 "Work Team" (1 message)

9. Admin registers the group:

   > @Andy register chat 1 as "tg_family"
   ✓ Registered "Family Group" as tg_family
     Working dir: groups/tg_family/
     Trigger required: yes (@Andy)
     CLAUDE.md created with default template

10. Future messages from that chat are now processed
```

### 19.3 Admin Commands (Main Group Only)

These commands are only available in the main group (elevated privileges):

| Command | Effect |
|---------|--------|
| `show pending chats` | List unregistered chats that have sent messages |
| `register chat <id> as <folder>` | Register a chat, create group directory |
| `unregister <folder>` | Remove a group registration |
| `list groups` | Show all registered groups and their status |
| `list tasks` | Show all scheduled tasks across all groups |
| `show permissions` | Display current permission rules and overrides |
| `approve <tool> for <group>` | Add a persistent permission override |

### 19.4 Cross-Channel Permission Ask

When a channel doesn't support interactive permission asks (e.g., an incoming email triggering a bash command), the permission ask is routed to the main group:

```
Email Channel (no interactive ask)
  └─ agent wants to call bash("npm test")
     └─ Permission: "ask"
        └─ channel.askPermission is undefined
           └─ Orchestrator.askViaMainGroup()
              └─ sends to main group:
                 "[From work-email] Agent wants to run:
                  bash: npm test
                  Allow? Reply: yes/no/always"
              └─ admin replies "always"
              └─ persisted to config/overrides.yml:
                 "work-email:bash:npm test": allow
```

### 19.5 Group Lifecycle

```
                    ┌──────────────┐
                    │  Unregistered │ ← messages arrive but are ignored
                    └──────┬───────┘
                           │ admin: "register chat X as folder_name"
                    ┌──────▼───────┐
                    │  Registered   │ ← messages are processed
                    │  (active)     │
                    └──────┬───────┘
                           │ admin: "unregister folder_name"
                    ┌──────▼───────┐
                    │  Unregistered │ ← directory preserved, messages ignored
                    └──────────────┘
```

---

## 20. Error Handling Strategy

### 20.1 Principles

| Principle | Implementation |
|-----------|---------------|
| **Fail fast for config errors** | Zod validation at startup. Invalid config = process exits with clear error. |
| **Fail graceful for runtime errors** | Agent errors don't crash the framework. Log, emit event, continue. |
| **Never propagate plugin errors** | EventBus catches all handler errors. Plugin bugs never crash the core. |
| **Retry with backoff** | Agent execution failures get exponential backoff (5s, 10s, 20s, ...) |
| **Circuit breaker for channels** | If a channel fails 5 times, mark it as disconnected, try reconnecting. |

### 20.2 Error Categories

```typescript
// framework/errors.ts

/** Config errors — fail fast at startup */
export class ConfigError extends Error {
  constructor(message: string) {
    super(`Configuration error: ${message}`)
    this.name = 'ConfigError'
  }
}

/** Permission errors — report to AI, don't crash */
export class PermissionDeniedError extends Error {
  constructor(public tool: string, public reason: string) {
    super(`Permission denied for tool "${tool}": ${reason}`)
    this.name = 'PermissionDeniedError'
  }
}

/** Channel errors — log and try to reconnect */
export class ChannelError extends Error {
  constructor(public channel: string, message: string) {
    super(`Channel "${channel}" error: ${message}`)
    this.name = 'ChannelError'
  }
}
```

---

## 21. Testing Strategy

### 21.1 Test Levels

| Level | What | How |
|-------|------|-----|
| **Unit** | Individual modules (PermissionEngine, EventBus, Config) | vitest, mock dependencies |
| **Integration** | Module interactions (Orchestrator + Permission + Tools) | vitest, in-memory SQLite |
| **E2E** | Full message flow (CLI channel → Agent → response) | vitest, real pi-mono agent with mock LLM |

### 21.2 Test Examples

```typescript
// tests/permission.test.ts
import { describe, it, expect } from 'vitest'
import { PermissionEngine } from '../framework/permission.js'

describe('PermissionEngine', () => {
  const engine = new PermissionEngine({
    default: 'ask',
    rules: [
      { tool: 'read', action: 'allow' },
      { tool: 'read', pattern: '**/.env*', action: 'deny' },
      { tool: 'bash', pattern: 'rm -rf *', action: 'deny' },
      { tool: 'bash', action: 'ask' },
      { tool: 'web_search', action: 'allow' },
    ],
  })
  const ctx = { groupId: 'tg:family', sessionId: 's1', actor: 'agent' }

  it('allows reading normal files', () => {
    expect(engine.evaluate('read', { path: 'src/index.ts' }, ctx)).toBe('allow')
  })

  it('denies reading .env files', () => {
    expect(engine.evaluate('read', { path: '.env' }, ctx)).toBe('deny')
    expect(engine.evaluate('read', { path: 'config/.env.local' }, ctx)).toBe('deny')
  })

  it('denies rm -rf', () => {
    expect(engine.evaluate('bash', { command: 'rm -rf /' }, ctx)).toBe('deny')
  })

  it('asks for other bash commands', () => {
    expect(engine.evaluate('bash', { command: 'npm install' }, ctx)).toBe('ask')
  })

  it('allows web search', () => {
    expect(engine.evaluate('web_search', { query: 'test' }, ctx)).toBe('allow')
  })

  it('uses default for unknown tools', () => {
    expect(engine.evaluate('unknown_tool', {}, ctx)).toBe('ask')
  })

  it('respects session approvals', () => {
    engine.approve('bash', ctx, 'session', 'npm test')
    expect(engine.evaluate('bash', { command: 'npm test' }, ctx)).toBe('allow')
  })
})
```

```typescript
// tests/event-bus.test.ts
import { describe, it, expect, vi } from 'vitest'
import { EventBus } from '../framework/event-bus.js'

describe('EventBus', () => {
  it('delivers events to subscribers', async () => {
    const bus = new EventBus()
    const handler = vi.fn()
    bus.on('tool.before', handler)

    await bus.emit('tool.before', {
      tool: 'read',
      args: {},
      permission: 'allow',
      sessionId: 's1',
      groupId: 'tg:family',
      actor: 'agent',
    })

    expect(handler).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ tool: 'read' }))
  })

  it('onAll receives all events', async () => {
    const bus = new EventBus()
    const handler = vi.fn()
    bus.onAll(handler)

    await bus.emit('tool.before', {
      tool: 'read',
      args: {},
      permission: 'allow',
      sessionId: 's1',
      groupId: 'tg:family',
      actor: 'agent',
    })
    await bus.emit('tool.after', {
      tool: 'read',
      result: null,
      durationMs: 100,
      sessionId: 's1',
      groupId: 'tg:family',
      actor: 'agent',
    })

    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('handler errors do not propagate', async () => {
    const bus = new EventBus()
    bus.on('tool.before', () => { throw new Error('bug') })

    // Should not throw
    await bus.emit('tool.before', {
      tool: 'read',
      args: {},
      permission: 'allow',
      sessionId: 's1',
      groupId: 'tg:family',
      actor: 'agent',
    })
  })

  it('unsubscribe works', async () => {
    const bus = new EventBus()
    const handler = vi.fn()
    const unsub = bus.on('tool.before', handler)
    unsub()

    await bus.emit('tool.before', {
      tool: 'read',
      args: {},
      permission: 'allow',
      sessionId: 's1',
      groupId: 'tg:family',
      actor: 'agent',
    })
    expect(handler).not.toHaveBeenCalled()
  })
})
```

---

## 22. Implementation Phases

### Phase 1: Minimal CLI Loop (Week 1)

**Goal**: Type a message in the terminal, get a response from Claude, with permission checks.

| Task | Module | Est. Lines | Priority |
|------|--------|------------|----------|
| `createApp()` entry point | Core | 50 | P0 |
| `loadConfig()` with Zod | Config | 100 | P0 |
| `EventBus` | EventBus | 100 | P0 |
| `PermissionEngine` + YAML loader | Permission | 200 | P0 |
| `defineTool()` + `toAgentTool()` + scanner | Tool | 150 | P0 |
| `defineChannel()` + scanner | Channel | 100 | P0 |
| CLI channel (`channels/cli.ts`) | Channel | 80 | P0 |
| `Orchestrator` (simplified: single group, in-memory) | Orchestrator | 300 | P0 |
| Permission wrapping (`wrapToolsWithPermissions`) | Tool Wrapper | 100 | P0 |
| Logger (pino) | Infra | 20 | P0 |

**Deliverable**: `npm run dev` → CLI prompt → type message → Claude responds → tool calls show permission checks.

**Verification**:
```bash
$ npm run dev
> @Andy what files are in this directory?
[Permission: allow] Tool "ls" executing...
[Permission: allow] Tool "read" executing...

Here are the files in your directory:
- index.ts
- package.json
...

> @Andy delete all temp files
[Permission: ASK] Tool "bash" wants to run: rm -rf temp/
  Allow? (y/n/session/always): n
[Permission: DENIED] User rejected bash(rm -rf temp/)

I won't delete those files. Would you like me to do something else?
```

### Phase 2: Storage + Groups + Plugins (Week 2)

**Goal**: Persistent messages, multiple groups, plugin system.

| Task | Module | Est. Lines | Priority |
|------|--------|------------|----------|
| SQLite `Storage` class | Storage | 300 | P0 |
| `GroupManager` | Group | 150 | P0 |
| Plugin scanner + `PluginAPI` | Plugin | 150 | P0 |
| `audit-log` plugin | Plugin | 40 | P1 |
| Message persistence in Orchestrator | Orchestrator | 50 | P0 |
| Group registration via main channel | Orchestrator | 80 | P1 |
| Session persistence (JSONL) | Session | 100 | P1 |

**Deliverable**: Messages survive restarts. Multiple groups with isolated memory. Audit log written to `logs/audit.jsonl`.

### Phase 3: Multi-Channel + Scheduler (Week 3)

**Goal**: Telegram channel working. Scheduled tasks running.

| Task | Module | Est. Lines | Priority |
|------|--------|------------|----------|
| Telegram channel (`channels/telegram.ts`) | Channel | 150 | P0 |
| `Scheduler` class | Scheduler | 200 | P0 |
| Task scheduling via IPC/tool | Tool | 80 | P0 |
| Concurrent agent queue | Orchestrator | 100 | P1 |
| Steering messages (pipe to running agent) | Orchestrator | 80 | P1 |

**Deliverable**: Talk to assistant via Telegram. Schedule recurring tasks.

### Phase 4: Production Hardening (Week 4)

| Task | Module | Priority |
|------|--------|----------|
| Container isolation mode | Container | P1 |
| Graceful shutdown | Orchestrator | P0 |
| Crash recovery (unprocessed messages) | Orchestrator | P0 |
| Rate limiting plugin | Plugin | P1 |
| Dangerous command guard plugin | Plugin | P1 |
| `launchd` / `systemd` service setup | Infra | P1 |
| More channels (Slack, WeChat) | Channel | P2 |

---

## Appendix A: Full TypeScript Type Definitions

```typescript
// framework/types.ts — Complete type definitions

// ═══════════════════════════════════════════
//  Events
// ═══════════════════════════════════════════

export interface EventMap {
  // App lifecycle
  'app.start': { channels: string[] }
  'app.stop': { reason: string }
  'app.error': { source: string; error: Error }

  // Messages
  'message.inbound': {
    channel: string
    chatId: string
    sender: string
    content: string
  }
  'message.outbound': {
    channel: string
    chatId: string
    content: string
  }

  // Agent
  'agent.start': { sessionId: string; chatId: string }
  'agent.turn': { turnIndex: number; chatId: string }
  'agent.text_delta': { delta: string; chatId: string }
  'agent.end': { sessionId: string; chatId: string; durationMs: number }

  // Tools
  'tool.before': {
    tool: string
    args: unknown
    permission: PermissionAction
    sessionId: string
    groupId: string
    actor: string
  }
  'tool.after': {
    tool: string
    result: unknown
    durationMs: number
    sessionId: string
    groupId: string
    actor: string
  }
  'tool.denied': {
    tool: string
    args: unknown
    reason: string
    sessionId: string
    groupId: string
    actor: string
  }
  'tool.error': {
    tool: string
    error: Error
    durationMs: number
    sessionId: string
    groupId: string
    actor: string
  }
  'tool.progress': {
    tool: string
    status: string
    progress?: number
    sessionId?: string
    groupId?: string
    actor?: string
  }

  // Permissions
  'permission.ask': {
    tool: string
    args: unknown
    sessionId: string
    groupId: string
    actor: string
  }
  'permission.approved': {
    tool: string
    scope: 'once' | 'session' | 'always'
    sessionId: string
    groupId: string
    actor: string
  }
  'permission.rejected': {
    tool: string
    sessionId: string
    groupId: string
    actor: string
  }

  // Sessions
  'session.created': { sessionId: string; chatId: string; groupFolder: string }
  'session.compacted': {
    sessionId: string
    messagesBefore: number
    messagesAfter: number
  }

  // Tasks
  'task.scheduled': {
    taskId: string
    chatId: string
    scheduleType: string
    scheduleValue: string
  }
  'task.executed': {
    taskId: string
    durationMs: number
    success: boolean
  }
  'task.failed': {
    taskId: string
    error: string
  }

  // Channels
  'channel.connected': { channel: string }
  'channel.disconnected': { channel: string; reason?: string }
  'channel.error': { channel: string; error: Error }

  // Groups
  'group.registered': { chatId: string; name: string; folder: string }
  'group.removed': { chatId: string }
}

// ═══════════════════════════════════════════
//  Storage Types
// ═══════════════════════════════════════════

export interface StoredMessage {
  seq: number         // Monotonic auto-increment ID (SQLite AUTOINCREMENT)
  id: string
  chatId: string
  sender: string
  senderName: string
  content: string
  timestamp: string
  isFromMe: boolean
  isBotMessage?: boolean
  channel: string
}

export interface ChatInfo {
  chatId: string
  name: string
  lastMessageTime: string
  channel: string
  isGroup: boolean
}

export interface TaskRunLog {
  taskId: string
  runAt: string
  durationMs: number
  status: 'success' | 'error'
  result?: string
  error?: string
}
```

---

## Appendix B: SQLite Schema

```sql
-- Messages
CREATE TABLE IF NOT EXISTS messages (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,  -- monotonic cursor (replaces timestamp-based polling)
  id TEXT NOT NULL,
  chat_id TEXT,
  sender TEXT,
  sender_name TEXT,
  content TEXT,
  timestamp TEXT,
  is_from_me INTEGER DEFAULT 0,
  is_bot_message INTEGER DEFAULT 0,
  channel TEXT,
  UNIQUE(id, chat_id)
);
CREATE INDEX IF NOT EXISTS idx_messages_seq ON messages(seq);
CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, seq);

-- Chat metadata
CREATE TABLE IF NOT EXISTS chats (
  chat_id TEXT PRIMARY KEY,
  name TEXT,
  last_message_time TEXT,
  channel TEXT,
  is_group INTEGER DEFAULT 0
);

-- Registered groups
CREATE TABLE IF NOT EXISTS groups (
  chat_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  folder TEXT NOT NULL UNIQUE,
  channel TEXT NOT NULL,
  is_group INTEGER DEFAULT 1,
  require_trigger INTEGER DEFAULT 1,
  is_main INTEGER DEFAULT 0,
  container_config TEXT,        -- JSON
  registered_at TEXT NOT NULL
);

-- Scheduled tasks
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  group_folder TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  prompt TEXT NOT NULL,
  schedule_type TEXT NOT NULL,  -- 'cron' | 'interval' | 'once'
  schedule_value TEXT NOT NULL,
  next_run TEXT,
  last_run TEXT,
  status TEXT DEFAULT 'active', -- 'active' | 'paused' | 'completed'
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_next_run ON tasks(next_run);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

-- Task execution history
CREATE TABLE IF NOT EXISTS task_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  run_at TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  status TEXT NOT NULL,          -- 'success' | 'error'
  result TEXT,
  error TEXT,
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);

-- Key-value state
CREATE TABLE IF NOT EXISTS state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Sessions
CREATE TABLE IF NOT EXISTS sessions (
  group_folder TEXT PRIMARY KEY,
  session_id TEXT NOT NULL
);
```

---

## Appendix C: Event Catalog

Complete event reference with descriptions and typical subscribers:

| Event | Emitted When | Data Fields | Typical Subscribers |
|-------|-------------|-------------|---------------------|
| `app.start` | Framework fully initialized | `channels: string[]` | Audit log |
| `app.stop` | Graceful shutdown initiated | `reason: string` | Cleanup plugins |
| `app.error` | Unhandled framework error | `source, error` | Alert plugins |
| `message.inbound` | Message received from any channel | `channel, chatId, sender, content` | Audit log, analytics |
| `message.outbound` | Message sent to any channel | `channel, chatId, content` | Audit log, analytics |
| `agent.start` | Agent loop begins for a group | `sessionId, chatId` | Audit log |
| `agent.turn` | New LLM call within agent loop | `turnIndex, chatId` | Debug logging |
| `agent.text_delta` | Streaming text from LLM | `delta, chatId` | Real-time UI |
| `agent.end` | Agent loop completes | `sessionId, chatId, durationMs` | Audit log, metrics |
| `tool.before` | Tool about to execute (after intercept + permission) | `tool, args, permission, sessionId, groupId, actor` | Audit log, rate limit |
| `tool.after` | Tool completed successfully | `tool, result, durationMs, sessionId, groupId, actor` | Audit log, metrics |
| `tool.denied` | Tool execution denied | `tool, args, reason, sessionId, groupId, actor` | Alert, audit log |
| `tool.error` | Tool threw an error | `tool, error, durationMs, sessionId, groupId, actor` | Alert, audit log |
| `tool.progress` | Tool reports intermediate progress | `tool, status, progress, sessionId?, groupId?, actor?` | Real-time UI |
| `permission.ask` | Permission engine needs user input | `tool, args, sessionId, groupId, actor` | Channel adapter |
| `permission.approved` | User approved the operation | `tool, scope, sessionId, groupId, actor` | Audit log |
| `permission.rejected` | User rejected the operation | `tool, sessionId, groupId, actor` | Audit log |
| `session.created` | New session started for a group | `sessionId, chatId, groupFolder` | Audit log |
| `session.compacted` | Session context was compressed | `sessionId, messagesBefore, messagesAfter` | Audit log |
| `task.scheduled` | New scheduled task created | `taskId, chatId, scheduleType, scheduleValue` | Audit log |
| `task.executed` | Scheduled task completed | `taskId, durationMs, success` | Audit log |
| `task.failed` | Scheduled task failed | `taskId, error` | Alert |
| `channel.connected` | Channel successfully connected | `channel` | Audit log |
| `channel.disconnected` | Channel disconnected | `channel, reason` | Alert, reconnect |
| `channel.error` | Channel error occurred | `channel, error` | Alert |
| `group.registered` | New group registered | `chatId, name, folder` | Audit log |
| `group.removed` | Group unregistered | `chatId` | Cleanup |

---

## Appendix D: Reference Projects

This framework's design draws from four open-source projects:

| Project | Repository | What We Borrowed |
|---------|-----------|-----------------|
| **pi-mono** | `github.com/badlogic/pi-mono` | Agent runtime, LLM abstraction, tools, extension system, session management. Used as npm dependency. |
| **NanoClaw** | `github.com/qwibitai/nanoclaw` | Channel self-registration, group isolation, container security, SQLite storage, message polling loop. |
| **OpenCode** | `github.com/opencode-ai/opencode` | Three-level permission model (allow/ask/deny), event bus, tool registry, instance isolation. |
| **OpenClaw** | `github.com/nicepkg/openclaw` | Complete plugin SDK, multi-channel adapter, gateway architecture, config hot-reload. |

### Key Decisions: Why pi-mono as Foundation

1. **20+ LLM providers** — no need to write provider code
2. **Battle-tested agent loop** — handles tool execution, streaming, context management
3. **Built-in coding tools** — read, write, edit, bash, grep, find, ls
4. **Extension system** — our plugins build on top of it
5. **Session persistence** — JSONL format is human-readable
6. **Active development** — NanoClaw and OpenClaw both depend on it
7. **~5000 lines for all of this** — small enough to understand and debug

### Key Decisions: What We Did NOT Borrow

| Rejected Pattern | From | Why |
|-----------------|------|-----|
| Namespace-based modules | OpenCode | Non-standard TS pattern, harder for contributors |
| WebSocket gateway | OpenClaw | Over-engineered for single-user assistant |
| Vector memory (sqlite-vec) | OpenClaw | Nice but not essential for Phase 1-3 |
| TUI framework | pi-mono (pi-tui) | We output to messaging channels, not terminal UI |
| Custom JSONL sessions | pi-mono | Use pi-mono's SessionManager directly; SQLite handles routing/indexing only |
| Container-only execution | NanoClaw | Too heavy for development; optional for production |

---

*End of Technical Specification*
