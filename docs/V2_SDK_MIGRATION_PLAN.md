# Claude Agent SDK V2 迁移方案

> **项目**: Any Code (claude-workbench)
> **版本**: 基于当前架构分析
> **更新日期**: 2025-12

## 一、概述

### 1.1 目标
将当前基于 Claude CLI 进程的架构迁移到 Claude Agent SDK V2，以获得：
- ✅ 完整的斜杠命令支持 (`/compact`, `/clear`, `/cost` 等)
- ✅ 更简洁的多轮对话 API (`send()/receive()` 模式)
- ✅ 更好的会话管理和恢复能力
- ✅ 原生的权限控制和工具配置

### 1.2 项目现状分析

**核心发现**：
- 这是一个**三引擎架构**（Claude/Codex/Gemini），已有成熟的多引擎集成模式
- 所有引擎输出都转换为统一的 `ClaudeStreamMessage` 格式
- 会话使用 JSONL 格式存储于 `~/.claude/projects/{projectId}/`
- 已有完善的权限系统（4种模式）和进程状态管理

**可复用的模式**：
1. `ClaudeProcessState` 进程状态管理模式
2. 消息格式转换层（参考 `codexConverter.ts`, `geminiConverter.ts`）
3. 事件发射机制（`claude-output:{sessionId}`）
4. 权限配置系统（`ClaudeExecutionConfig`）

### 1.3 当前架构（详细）

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Any Code 多引擎架构                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Frontend (React 18 + TypeScript 5)                                     │
│  ├── src/hooks/                                                         │
│  │   ├── usePromptExecution.ts   ← invoke("execute_claude_code")       │
│  │   ├── useSessionLifecycle.ts  ← listen("claude-output:{sessionId}") │
│  │   └── useMessageTranslation.ts ← 消息翻译中间件                      │
│  ├── src/contexts/                                                      │
│  │   └── MessagesContext.tsx     ← 消息状态 (数据/操作分离)             │
│  ├── src/components/message/                                            │
│  │   └── StreamMessageV2.tsx     ← 统一消息渲染器                       │
│  └── src/lib/                                                           │
│      ├── codexConverter.ts       ← Codex → ClaudeStreamMessage         │
│      └── geminiConverter.ts      ← Gemini → ClaudeStreamMessage        │
│                                                                         │
│  ↕ Tauri IPC (100+ 命令注册)                                            │
│    Events: claude-output, claude-output:{session_id},                   │
│            claude-complete:{session_id}, claude-session-state           │
│                                                                         │
│  Backend (Rust + Tauri 2.9)                                             │
│  ├── src-tauri/src/commands/claude/                                     │
│  │   ├── cli_runner.rs           ← Claude CLI 进程管理                  │
│  │   │   ├── ClaudeProcessState  ← 进程状态 (Arc<Mutex<Option<Child>>>) │
│  │   │   ├── execute_claude_code ← 新建会话                             │
│  │   │   ├── continue_claude_code ← 继续会话 (-c)                       │
│  │   │   ├── resume_claude_code  ← 恢复会话 (--resume)                  │
│  │   │   └── cancel_claude_execution ← 取消执行                         │
│  │   ├── config.rs               ← 配置加载                             │
│  │   ├── models.rs               ← 数据模型                             │
│  │   └── session_history.rs      ← JSONL 历史加载                       │
│  ├── src-tauri/src/commands/codex/   ← Codex 引擎                       │
│  ├── src-tauri/src/commands/gemini/  ← Gemini 引擎                      │
│  └── src-tauri/src/commands/permission_config.rs                        │
│      ├── PermissionMode: Interactive/AcceptEdits/ReadOnly/Plan          │
│      └── ClaudeExecutionConfig: 执行参数构建                            │
│                                                                         │
│  External Processes                                                     │
│  ├── Claude CLI (claude.exe / claude)                                   │
│  │   └── ~/.claude/projects/{projectId}/{sessionId}.jsonl               │
│  ├── Codex CLI (codex / codex.exe)                                      │
│  │   └── ~/.codex/sessions/{YYYY}/{MM}/{DD}/{sessionId}.jsonl           │
│  └── Gemini CLI (gemini)                                                │
│      └── ~/.gemini/tmp/{projectHash}/chats/                             │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.4 关键代码路径

| 功能 | 当前文件 | SDK 迁移后 |
|------|---------|-----------|
| 进程启动 | `cli_runner.rs:spawn_claude_process()` | `sdk_runner.rs:spawn_sdk_sidecar()` |
| 权限配置 | `permission_config.rs:ClaudeExecutionConfig` | 映射到 SDK `Options` |
| 消息转换 | `codexConverter.ts` (参考) | `sdkConverter.ts` (新增) |
| 事件发射 | `app_handle.emit("claude-output:{}", &line)` | 保持不变 |
| 会话恢复 | `resume_claude_code()` | `session.resume()` via SDK |

### 1.5 目标架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                   目标架构 (SDK V2 Mode) - 第四引擎                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Frontend (保持现有架构)                                                 │
│  ├── src/hooks/                                                         │
│  │   ├── usePromptExecution.ts    ← 新增 engine: 'claude-sdk' 分支     │
│  │   ├── useSessionLifecycle.ts   ← 保持不变                            │
│  │   └── useSlashCommands.ts      ← 新增：斜杠命令 hook                 │
│  └── src/lib/                                                           │
│      └── sdkConverter.ts          ← 新增：SDK → ClaudeStreamMessage    │
│                                                                         │
│  ↕ Tauri IPC (复用现有事件格式)                                          │
│                                                                         │
│  Backend (Rust/Tauri)                                                   │
│  ├── src-tauri/src/commands/claude/                                     │
│  │   ├── sdk_runner.rs            ← 新增：SDK Sidecar 管理              │
│  │   │   ├── SdkProcessState      ← 复用 ClaudeProcessState 模式       │
│  │   │   ├── execute_claude_sdk   ← SDK 模式执行                        │
│  │   │   └── execute_slash_command ← 斜杠命令                           │
│  │   └── cli_runner.rs            ← 保留：作为 fallback                 │
│  └── src-tauri/src/commands/permission_config.rs                        │
│      └── 新增：SDK PermissionMode 映射                                  │
│                                                                         │
│  ↕ stdio JSON-RPC (命令/响应)                                           │
│                                                                         │
│  Node.js Sidecar (新增)                                                 │
│  ├── src-sidecar/                                                       │
│  │   ├── index.ts                 ← 入口 + 命令路由                     │
│  │   ├── session-manager.ts       ← V2 会话管理                         │
│  │   │   ├── unstable_v2_createSession()                               │
│  │   │   ├── unstable_v2_resumeSession()                               │
│  │   │   └── session.send() / receive()                                │
│  │   └── message-converter.ts     ← SDKMessage → ClaudeStreamMessage   │
│  └── @anthropic-ai/claude-agent-sdk                                     │
│                                                                         │
│  会话存储 (保持兼容)                                                     │
│  └── SDK 会话也存储于 ~/.claude/projects/{projectId}/                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.6 权限模式映射

| 当前权限模式 | SDK permissionMode | 说明 |
|-------------|-------------------|------|
| `Interactive` | `'default'` | 默认交互式确认 |
| `AcceptEdits` | `'acceptEdits'` | 自动接受编辑 |
| `ReadOnly` | `'plan'` + 限制工具 | 只读分析 |
| `Plan` | `'plan'` | 规划模式 |
| (新增) | `'bypassPermissions'` | 完全自动化 |

---

## 二、Sidecar 设计

### 2.1 文件结构（融入现有项目）

```
claude-workbench/
├── src-sidecar/                           # 新增：Node.js Sidecar 源码
│   ├── package.json
│   ├── tsconfig.json
│   ├── esbuild.config.js                  # 单文件打包配置
│   ├── src/
│   │   ├── index.ts                       # 入口 + 命令路由
│   │   ├── session-manager.ts             # V2 会话管理
│   │   ├── message-converter.ts           # SDKMessage → ClaudeStreamMessage
│   │   ├── permission-mapper.ts           # 权限模式映射
│   │   └── types.ts                       # 类型定义（与前端共享）
│   └── dist/
│       └── claude-sdk-bridge.js           # 打包后单文件 (~500KB)
│
├── src-tauri/
│   ├── src/commands/claude/
│   │   ├── mod.rs                         # 更新：导出 sdk_runner
│   │   ├── sdk_runner.rs                  # 新增：SDK 模式运行器
│   │   │   ├── SdkProcessState            # 类似 ClaudeProcessState
│   │   │   ├── execute_claude_sdk()       # SDK 模式执行
│   │   │   ├── continue_claude_sdk()      # SDK 模式继续
│   │   │   ├── resume_claude_sdk()        # SDK 模式恢复
│   │   │   └── execute_slash_command()    # 斜杠命令
│   │   └── cli_runner.rs                  # 保留：CLI 模式 fallback
│   ├── src/main.rs                        # 更新：注册新命令
│   ├── tauri.conf.json                    # 更新：sidecar 资源
│   └── Cargo.toml                         # 无需更改
│
├── src/
│   ├── hooks/
│   │   └── useSlashCommands.ts            # 新增：斜杠命令 hook
│   ├── lib/
│   │   ├── api.ts                         # 更新：添加 SDK API
│   │   └── sdkConverter.ts                # 新增：前端消息转换
│   └── types/
│       └── claude.ts                      # 更新：添加 SDK 特有字段
│
└── scripts/
    └── build-sidecar.js                   # 新增：sidecar 构建脚本
```

### 2.2 与现有代码的关系

```
现有代码                              新增代码
─────────────────────────────────────────────────────────────
cli_runner.rs                    →    sdk_runner.rs (复用模式)
├── ClaudeProcessState           →    ├── SdkProcessState
├── execute_claude_code()        →    ├── execute_claude_sdk()
├── continue_claude_code()       →    ├── continue_claude_sdk()
├── resume_claude_code()         →    ├── resume_claude_sdk()
└── cancel_claude_execution()    →    └── cancel_sdk_execution()

codexConverter.ts                →    sdkConverter.ts (参考实现)
├── convertEvent()               →    ├── convertSDKMessage()
└── CodexEvent → ClaudeStreamMessage → └── SDKMessage → ClaudeStreamMessage

permission_config.rs             →    permission_config.rs (扩展)
├── PermissionMode               →    ├── 新增 SDK 映射函数
└── ClaudeExecutionConfig        →    └── 新增 SdkSessionConfig
```

### 2.2 Sidecar 通信协议

#### 请求格式 (Rust → Sidecar)

```typescript
interface SidecarCommand {
  // 命令类型
  type: "create_session" | "resume_session" | "send" | "close" | "get_info";

  // 命令 ID（用于响应匹配）
  id: string;

  // 会话配置（create_session/resume_session 时使用）
  config?: {
    model?: string;
    cwd?: string;
    allowedTools?: string[];
    permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan";
    maxTurns?: number;
    systemPrompt?: string;
    settingSources?: ("user" | "project" | "local")[];
  };

  // 会话 ID（resume_session/send/close 时使用）
  sessionId?: string;

  // 消息内容（send 时使用，支持斜杠命令如 "/compact"）
  prompt?: string;
}
```

#### 响应格式 (Sidecar → Rust)

```typescript
interface SidecarResponse {
  // 响应类型
  type: "ack" | "message" | "error" | "complete" | "info";

  // 对应的命令 ID
  commandId: string;

  // 会话 ID
  sessionId?: string;

  // 消息数据（已转换为 ClaudeStreamMessage 格式）
  data?: ClaudeStreamMessage;

  // 错误信息
  error?: string;

  // 额外信息（get_info 响应）
  info?: {
    slashCommands?: string[];
    models?: { id: string; name: string }[];
    mcpServers?: { name: string; status: string }[];
  };
}
```

### 2.3 Sidecar 核心实现

#### src-sidecar/src/index.ts

```typescript
import * as readline from "readline";
import { SessionManager } from "./session-manager";
import { handleCommand, type SidecarCommand, type SidecarResponse } from "./command-handler";

const sessionManager = new SessionManager();

// 输出响应到 stdout
function respond(response: SidecarResponse): void {
  console.log(JSON.stringify(response));
}

// 主循环
async function main(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  // 发送就绪信号
  respond({
    type: "ack",
    commandId: "init",
    info: { ready: true },
  });

  for await (const line of rl) {
    if (!line.trim()) continue;

    try {
      const command: SidecarCommand = JSON.parse(line);

      // 处理命令并流式返回响应
      for await (const response of handleCommand(command, sessionManager)) {
        respond(response);
      }
    } catch (err) {
      respond({
        type: "error",
        commandId: "unknown",
        error: `Parse error: ${err}`,
      });
    }
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ type: "error", error: String(err) }));
  process.exit(1);
});
```

#### src-sidecar/src/session-manager.ts

```typescript
import {
  unstable_v2_createSession,
  unstable_v2_resumeSession,
  type SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";

export interface SessionConfig {
  model?: string;
  cwd?: string;
  allowedTools?: string[];
  permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan";
  maxTurns?: number;
  systemPrompt?: string;
  settingSources?: ("user" | "project" | "local")[];
}

type Session = ReturnType<typeof unstable_v2_createSession>;

export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private sessionCounter = 0;

  async createSession(config: SessionConfig): Promise<{ session: Session; tempId: string }> {
    const tempId = `temp_${++this.sessionCounter}`;

    const session = unstable_v2_createSession({
      model: config.model || "claude-sonnet-4-5-20250929",
      cwd: config.cwd,
      allowedTools: config.allowedTools,
      permissionMode: config.permissionMode || "default",
      maxTurns: config.maxTurns,
      systemPrompt: config.systemPrompt,
      settingSources: config.settingSources || ["project"],
    });

    this.sessions.set(tempId, session);
    return { session, tempId };
  }

  async resumeSession(sessionId: string, config: SessionConfig): Promise<Session> {
    const session = unstable_v2_resumeSession(sessionId, {
      model: config.model || "claude-sonnet-4-5-20250929",
      cwd: config.cwd,
    });

    this.sessions.set(sessionId, session);
    return session;
  }

  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  updateSessionId(tempId: string, realId: string): void {
    const session = this.sessions.get(tempId);
    if (session) {
      this.sessions.delete(tempId);
      this.sessions.set(realId, session);
    }
  }

  closeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.close();
      this.sessions.delete(sessionId);
    }
  }

  closeAll(): void {
    for (const [id, session] of this.sessions) {
      session.close();
    }
    this.sessions.clear();
  }
}
```

#### src-sidecar/src/message-converter.ts

```typescript
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

/**
 * ClaudeStreamMessage 格式（与现有前端兼容）
 */
export interface ClaudeStreamMessage {
  type: "system" | "assistant" | "user" | "result" | "summary" | "thinking" | "tool_use";
  subtype?: string;
  session_id?: string;
  message?: {
    content?: any[];
    role?: string;
    usage?: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_tokens?: number;
      cache_read_tokens?: number;
    };
  };
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_tokens?: number;
    cache_read_tokens?: number;
  };
  result?: string;
  timestamp?: string;
  receivedAt?: string;
  // SDK 特有字段
  slash_commands?: string[];
  model?: string;
  tools?: string[];
  total_cost_usd?: number;
  duration_ms?: number;
  num_turns?: number;
  [key: string]: any;
}

/**
 * 将 SDK V2 消息转换为 ClaudeStreamMessage 格式
 */
export function convertSDKMessage(msg: SDKMessage): ClaudeStreamMessage | null {
  const timestamp = new Date().toISOString();

  switch (msg.type) {
    case "system":
      if (msg.subtype === "init") {
        return {
          type: "system",
          subtype: "init",
          session_id: msg.session_id,
          model: msg.model,
          tools: msg.tools,
          slash_commands: msg.slash_commands,
          timestamp,
          receivedAt: timestamp,
        };
      }
      if (msg.subtype === "compact_boundary") {
        return {
          type: "system",
          subtype: "compact_boundary",
          session_id: msg.session_id,
          timestamp,
          receivedAt: timestamp,
          compact_metadata: msg.compact_metadata,
        };
      }
      return null;

    case "assistant":
      return {
        type: "assistant",
        session_id: msg.session_id,
        message: {
          role: "assistant",
          content: msg.message.content,
          usage: msg.message.usage,
        },
        timestamp,
        receivedAt: timestamp,
      };

    case "user":
      return {
        type: "user",
        session_id: msg.session_id,
        message: {
          role: "user",
          content: msg.message.content,
        },
        timestamp,
        receivedAt: timestamp,
      };

    case "result":
      if (msg.subtype === "success") {
        return {
          type: "result",
          subtype: "success",
          session_id: msg.session_id,
          result: msg.result,
          usage: {
            input_tokens: msg.usage.input_tokens,
            output_tokens: msg.usage.output_tokens,
            cache_creation_tokens: msg.usage.cache_creation_input_tokens,
            cache_read_tokens: msg.usage.cache_read_input_tokens,
          },
          total_cost_usd: msg.total_cost_usd,
          duration_ms: msg.duration_ms,
          num_turns: msg.num_turns,
          timestamp,
          receivedAt: timestamp,
        };
      } else {
        // Error result
        return {
          type: "result",
          subtype: msg.subtype,
          session_id: msg.session_id,
          is_error: true,
          errors: msg.errors,
          usage: {
            input_tokens: msg.usage.input_tokens,
            output_tokens: msg.usage.output_tokens,
          },
          timestamp,
          receivedAt: timestamp,
        };
      }

    case "stream_event":
      // 处理流式事件（需要 includePartialMessages: true）
      // 转换为 thinking 或增量文本
      if (msg.event?.type === "content_block_delta") {
        const delta = msg.event.delta;
        if (delta?.type === "thinking_delta") {
          return {
            type: "thinking",
            content: delta.thinking,
            session_id: msg.session_id,
            timestamp,
            receivedAt: timestamp,
          };
        }
        if (delta?.type === "text_delta") {
          return {
            type: "assistant",
            subtype: "delta",
            session_id: msg.session_id,
            message: {
              role: "assistant",
              content: [{ type: "text", text: delta.text }],
            },
            timestamp,
            receivedAt: timestamp,
          };
        }
      }
      return null;

    default:
      return null;
  }
}

/**
 * 从 assistant 消息中提取文本内容
 */
export function extractTextFromAssistant(msg: SDKMessage): string {
  if (msg.type !== "assistant") return "";

  return msg.message.content
    .filter((block: any) => block.type === "text")
    .map((block: any) => block.text)
    .join("");
}
```

#### src-sidecar/src/command-handler.ts

```typescript
import { SessionManager, type SessionConfig } from "./session-manager";
import { convertSDKMessage, type ClaudeStreamMessage } from "./message-converter";

export interface SidecarCommand {
  type: "create_session" | "resume_session" | "send" | "close" | "get_info";
  id: string;
  config?: SessionConfig;
  sessionId?: string;
  prompt?: string;
}

export interface SidecarResponse {
  type: "ack" | "message" | "error" | "complete" | "info";
  commandId: string;
  sessionId?: string;
  data?: ClaudeStreamMessage;
  error?: string;
  info?: any;
}

export async function* handleCommand(
  command: SidecarCommand,
  sessionManager: SessionManager
): AsyncGenerator<SidecarResponse> {
  const { type, id, config, sessionId, prompt } = command;

  try {
    switch (type) {
      case "create_session": {
        const { session, tempId } = await sessionManager.createSession(config || {});
        yield {
          type: "ack",
          commandId: id,
          sessionId: tempId,
          info: { status: "session_created" },
        };
        break;
      }

      case "resume_session": {
        if (!sessionId) {
          yield { type: "error", commandId: id, error: "sessionId is required" };
          break;
        }
        await sessionManager.resumeSession(sessionId, config || {});
        yield {
          type: "ack",
          commandId: id,
          sessionId,
          info: { status: "session_resumed" },
        };
        break;
      }

      case "send": {
        if (!sessionId || !prompt) {
          yield { type: "error", commandId: id, error: "sessionId and prompt are required" };
          break;
        }

        const session = sessionManager.getSession(sessionId);
        if (!session) {
          yield { type: "error", commandId: id, error: `Session not found: ${sessionId}` };
          break;
        }

        // 发送消息（支持斜杠命令如 "/compact", "/clear"）
        await session.send(prompt);

        // 流式接收响应
        let realSessionId: string | undefined;
        for await (const msg of session.receive()) {
          // 提取真实的 session_id
          if (msg.session_id && !realSessionId) {
            realSessionId = msg.session_id;
            // 更新会话管理器中的 ID
            if (sessionId.startsWith("temp_")) {
              sessionManager.updateSessionId(sessionId, realSessionId);
            }
          }

          const converted = convertSDKMessage(msg);
          if (converted) {
            yield {
              type: "message",
              commandId: id,
              sessionId: realSessionId || sessionId,
              data: converted,
            };
          }
        }

        yield {
          type: "complete",
          commandId: id,
          sessionId: realSessionId || sessionId,
        };
        break;
      }

      case "close": {
        if (sessionId) {
          sessionManager.closeSession(sessionId);
        }
        yield {
          type: "ack",
          commandId: id,
          info: { status: "session_closed" },
        };
        break;
      }

      case "get_info": {
        // 获取可用的斜杠命令、模型等信息
        // 需要创建临时会话来获取
        const { session, tempId } = await sessionManager.createSession(config || {});

        try {
          const commands = await session.supportedCommands();
          const models = await session.supportedModels();

          yield {
            type: "info",
            commandId: id,
            info: {
              slashCommands: commands.map(c => c.name),
              models: models.map(m => ({ id: m.id, name: m.displayName })),
            },
          };
        } finally {
          sessionManager.closeSession(tempId);
        }
        break;
      }

      default:
        yield { type: "error", commandId: id, error: `Unknown command type: ${type}` };
    }
  } catch (err) {
    yield {
      type: "error",
      commandId: id,
      error: String(err),
    };
  }
}
```

#### src-sidecar/package.json

```json
{
  "name": "claude-sdk-sidecar",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "esbuild src/index.ts --bundle --platform=node --target=node18 --outfile=dist/claude-sdk-bridge.js",
    "dev": "tsx src/index.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^0.1.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "esbuild": "^0.20.0",
    "tsx": "^4.0.0",
    "typescript": "^5.4.0"
  }
}
```

---

## 三、Rust 后端改造

### 3.1 新增 sdk_runner.rs

```rust
// src-tauri/src/commands/claude/sdk_runner.rs

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

static COMMAND_COUNTER: AtomicU64 = AtomicU64::new(0);

fn generate_command_id() -> String {
    format!("cmd_{}", COMMAND_COUNTER.fetch_add(1, Ordering::SeqCst))
}

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
struct SidecarCommand {
    #[serde(rename = "type")]
    cmd_type: String,
    id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    config: Option<SessionConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    prompt: Option<String>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct SessionConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    cwd: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    allowed_tools: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    permission_mode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_turns: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    system_prompt: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    setting_sources: Option<Vec<String>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SidecarResponse {
    #[serde(rename = "type")]
    response_type: String,
    command_id: String,
    #[serde(default)]
    session_id: Option<String>,
    #[serde(default)]
    data: Option<serde_json::Value>,
    #[serde(default)]
    error: Option<String>,
    #[serde(default)]
    info: Option<serde_json::Value>,
}

// ============================================================================
// Sidecar Manager
// ============================================================================

struct SidecarProcess {
    child: Child,
    stdin: tokio::process::ChildStdin,
}

pub struct SidecarManager {
    process: Arc<Mutex<Option<SidecarProcess>>>,
}

impl SidecarManager {
    pub fn new() -> Self {
        Self {
            process: Arc::new(Mutex::new(None)),
        }
    }

    pub async fn ensure_running(&self, app: &AppHandle) -> Result<(), String> {
        let mut guard = self.process.lock().await;

        if guard.is_some() {
            return Ok(());
        }

        // 找到 sidecar 路径
        let sidecar_path = Self::find_sidecar_path(app)?;

        log::info!("Starting SDK sidecar from: {}", sidecar_path);

        let mut cmd = Command::new("node");
        cmd.arg(&sidecar_path);
        cmd.stdin(Stdio::piped());
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        // Windows: 隐藏控制台窗口
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }

        let mut child = cmd.spawn().map_err(|e| format!("Failed to spawn sidecar: {}", e))?;

        let stdin = child.stdin.take().ok_or("Failed to get sidecar stdin")?;

        *guard = Some(SidecarProcess { child, stdin });

        log::info!("SDK sidecar started successfully");
        Ok(())
    }

    fn find_sidecar_path(app: &AppHandle) -> Result<String, String> {
        // 尝试从资源目录查找
        if let Ok(resource_dir) = app.path().resource_dir() {
            let sidecar_path = resource_dir.join("sidecar").join("claude-sdk-bridge.js");
            if sidecar_path.exists() {
                return Ok(sidecar_path.to_string_lossy().to_string());
            }
        }

        // 开发模式：从项目目录查找
        let dev_path = std::env::current_dir()
            .map_err(|e| e.to_string())?
            .join("src-sidecar")
            .join("dist")
            .join("claude-sdk-bridge.js");

        if dev_path.exists() {
            return Ok(dev_path.to_string_lossy().to_string());
        }

        Err("Sidecar not found".to_string())
    }

    pub async fn send_command(&self, command: &SidecarCommand) -> Result<(), String> {
        let mut guard = self.process.lock().await;
        let process = guard.as_mut().ok_or("Sidecar not running")?;

        let json = serde_json::to_string(command).map_err(|e| e.to_string())?;
        process.stdin.write_all(json.as_bytes()).await.map_err(|e| e.to_string())?;
        process.stdin.write_all(b"\n").await.map_err(|e| e.to_string())?;
        process.stdin.flush().await.map_err(|e| e.to_string())?;

        Ok(())
    }

    pub async fn shutdown(&self) {
        let mut guard = self.process.lock().await;
        if let Some(mut process) = guard.take() {
            let _ = process.child.kill().await;
        }
    }
}

// ============================================================================
// Tauri Commands
// ============================================================================

/// 使用 SDK 执行 Claude 会话
#[tauri::command]
pub async fn execute_claude_sdk(
    app: AppHandle,
    project_path: String,
    prompt: String,
    model: String,
    plan_mode: Option<bool>,
) -> Result<(), String> {
    let manager = app.state::<SidecarManager>();

    // 确保 sidecar 运行
    manager.ensure_running(&app).await?;

    let command_id = generate_command_id();
    let permission_mode = if plan_mode.unwrap_or(false) { "plan" } else { "default" };

    // 1. 创建会话
    let create_cmd = SidecarCommand {
        cmd_type: "create_session".to_string(),
        id: command_id.clone(),
        config: Some(SessionConfig {
            model: Some(model),
            cwd: Some(project_path.clone()),
            permission_mode: Some(permission_mode.to_string()),
            setting_sources: Some(vec!["project".to_string()]),
            ..Default::default()
        }),
        session_id: None,
        prompt: None,
    };

    manager.send_command(&create_cmd).await?;

    // 2. 启动响应监听（需要单独的 stdout 读取任务）
    // ... 这部分需要更复杂的实现，包括读取 stdout 并转发事件

    Ok(())
}

/// 发送斜杠命令
#[tauri::command]
pub async fn execute_slash_command(
    app: AppHandle,
    session_id: String,
    command: String,
) -> Result<(), String> {
    let manager = app.state::<SidecarManager>();

    let cmd = SidecarCommand {
        cmd_type: "send".to_string(),
        id: generate_command_id(),
        config: None,
        session_id: Some(session_id),
        prompt: Some(command), // 如 "/compact", "/clear", "/cost"
    };

    manager.send_command(&cmd).await
}

/// 获取可用的斜杠命令列表
#[tauri::command]
pub async fn get_available_slash_commands(
    app: AppHandle,
) -> Result<Vec<String>, String> {
    let manager = app.state::<SidecarManager>();
    manager.ensure_running(&app).await?;

    let cmd = SidecarCommand {
        cmd_type: "get_info".to_string(),
        id: generate_command_id(),
        config: None,
        session_id: None,
        prompt: None,
    };

    manager.send_command(&cmd).await?;

    // TODO: 等待并解析响应
    // 这需要更复杂的请求-响应匹配机制

    Ok(vec![
        "/compact".to_string(),
        "/clear".to_string(),
        "/cost".to_string(),
        "/help".to_string(),
    ])
}
```

### 3.2 Tauri 配置更新

```json
// src-tauri/tauri.conf.json 更新
{
  "bundle": {
    "resources": [
      "sidecar/claude-sdk-bridge.js"
    ]
  }
}
```

---

## 四、前端适配

### 4.1 斜杠命令 Hook

```typescript
// src/hooks/useSlashCommands.ts

import { invoke } from "@tauri-apps/api/core";
import { useState, useCallback } from "react";

export interface SlashCommandInfo {
  name: string;
  description?: string;
}

export function useSlashCommands() {
  const [availableCommands, setAvailableCommands] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // 获取可用命令列表
  const fetchAvailableCommands = useCallback(async () => {
    setIsLoading(true);
    try {
      const commands = await invoke<string[]>("get_available_slash_commands");
      setAvailableCommands(commands);
      return commands;
    } catch (err) {
      console.error("Failed to fetch slash commands:", err);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 执行斜杠命令
  const executeCommand = useCallback(async (
    sessionId: string,
    command: string,
  ) => {
    // 确保命令以 / 开头
    const normalizedCommand = command.startsWith("/") ? command : `/${command}`;

    await invoke("execute_slash_command", {
      sessionId,
      command: normalizedCommand,
    });
  }, []);

  // 便捷方法
  const compact = useCallback((sessionId: string) =>
    executeCommand(sessionId, "/compact"), [executeCommand]);

  const clear = useCallback((sessionId: string) =>
    executeCommand(sessionId, "/clear"), [executeCommand]);

  const cost = useCallback((sessionId: string) =>
    executeCommand(sessionId, "/cost"), [executeCommand]);

  const help = useCallback((sessionId: string) =>
    executeCommand(sessionId, "/help"), [executeCommand]);

  return {
    availableCommands,
    isLoading,
    fetchAvailableCommands,
    executeCommand,
    // 便捷方法
    compact,
    clear,
    cost,
    help,
  };
}
```

### 4.2 UI 集成示例

```tsx
// 在聊天输入框组件中添加斜杠命令支持

import { useSlashCommands } from "@/hooks/useSlashCommands";

function ChatInput({ sessionId }: { sessionId: string }) {
  const { availableCommands, executeCommand } = useSlashCommands();
  const [input, setInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  // 检测斜杠命令输入
  useEffect(() => {
    if (input.startsWith("/")) {
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
    }
  }, [input]);

  const handleSubmit = async () => {
    if (input.startsWith("/")) {
      // 斜杠命令
      await executeCommand(sessionId, input);
    } else {
      // 普通消息
      // ... 原有逻辑
    }
    setInput("");
  };

  return (
    <div>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="输入消息或 / 开始斜杠命令..."
      />

      {showSuggestions && (
        <div className="slash-suggestions">
          {availableCommands
            .filter(cmd => cmd.startsWith(input))
            .map(cmd => (
              <button key={cmd} onClick={() => setInput(cmd)}>
                {cmd}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
```

---

## 五、实施步骤

### Phase 1: 基础设施 (预计 2-3 天)

1. **创建 src-sidecar 目录结构**
   - 初始化 package.json
   - 配置 TypeScript 和构建工具
   - 安装 @anthropic-ai/claude-agent-sdk

2. **实现 Sidecar 核心模块**
   - session-manager.ts
   - message-converter.ts
   - command-handler.ts
   - index.ts (入口)

3. **编写单元测试**
   - 消息转换测试
   - 会话管理测试

### Phase 2: Rust 集成 (预计 2-3 天)

4. **实现 sdk_runner.rs**
   - SidecarManager 结构
   - 进程生命周期管理
   - 命令发送和响应处理

5. **更新 Tauri 配置**
   - 添加 sidecar 资源打包
   - 注册新的 Tauri commands

6. **实现完整的 stdout 监听**
   - 异步读取 sidecar 输出
   - 转发事件到前端

### Phase 3: 前端集成 (预计 1-2 天)

7. **创建 useSlashCommands hook**

8. **更新 UI 组件**
   - 添加斜杠命令输入提示
   - 添加命令自动补全

### Phase 4: 测试和优化 (预计 2-3 天)

9. **集成测试**
   - 完整会话流程测试
   - 斜杠命令测试
   - 会话恢复测试

10. **性能优化**
    - Sidecar 启动时间优化
    - 消息传输延迟优化

11. **错误处理完善**
    - Sidecar 崩溃恢复
    - 网络错误处理

### Phase 5: 发布准备 (预计 1 天)

12. **打包配置**
    - 确保 sidecar 正确打包
    - 测试各平台兼容性

13. **文档更新**
    - 更新用户文档
    - 添加开发者指南

---

## 六、风险和缓解措施

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| V2 API 不稳定可能变化 | 中 | 保留 CLI 模式作为 fallback，抽象转换层 |
| Node.js 运行时增加包体积 | 低 | 可选的精简 Node.js 打包，或使用 Bun |
| Sidecar 进程管理复杂性 | 中 | 实现健壮的进程监控和自动重启 |
| 跨平台兼容性 | 中 | 早期进行多平台测试 |

---

## 七、回滚计划

如果 SDK V2 集成出现严重问题，可以通过以下方式快速回滚：

1. **配置开关**: 添加 `use_sdk_mode` 配置项
2. **双模式并存**: 保留 `cli_runner.rs` 完整功能
3. **运行时切换**: 允许用户在设置中选择执行模式

```rust
// 运行时模式选择
enum ExecutionMode {
    CLI,      // 原有模式
    SDK,      // 新 SDK 模式
}

pub async fn execute_prompt(mode: ExecutionMode, ...) -> Result<(), String> {
    match mode {
        ExecutionMode::CLI => execute_claude_code(...).await,
        ExecutionMode::SDK => execute_claude_sdk(...).await,
    }
}
```

---

## 八、后续优化

### 8.1 短期优化
- 实现 Sidecar 连接池，避免频繁创建进程
- 添加消息压缩，减少 IPC 开销
- 实现更智能的会话缓存

### 8.2 长期优化
- 考虑使用 Bun 替代 Node.js (更小的运行时)
- 实现 WebSocket 通信替代 stdio
- 支持更多 SDK 高级功能 (自定义工具、MCP 服务器等)

---

## 九、快速开始指南

### 9.1 最小可行产品 (MVP) 实现顺序

如果想快速验证 SDK V2 集成，建议按以下顺序实现：

```
Step 1: 创建 Sidecar 骨架 (1天)
├── src-sidecar/package.json
├── src-sidecar/src/index.ts (最小入口)
└── 验证：node dist/claude-sdk-bridge.js < test-command.json

Step 2: Rust 进程管理 (1天)
├── sdk_runner.rs (复制 cli_runner.rs 模式)
└── 验证：Tauri 命令可以启动 sidecar

Step 3: 消息流转 (1天)
├── 完整的消息转换
├── 事件发射到前端
└── 验证：前端可以接收和显示消息

Step 4: 斜杠命令 (0.5天)
├── execute_slash_command Tauri 命令
├── useSlashCommands hook
└── 验证：/compact, /clear 可以工作

Step 5: 会话管理 (0.5天)
├── 会话恢复
├── 会话继续
└── 验证：多轮对话正常工作
```

### 9.2 关键决策点

在开始实施前，需要确认以下决策：

| 决策点 | 选项 A | 选项 B | 建议 |
|-------|-------|-------|------|
| **执行模式** | 完全替换 CLI | CLI/SDK 双模式共存 | **选项 B**（渐进式） |
| **用户切换** | 自动选择 SDK | 设置中手动切换 | **自动选择**（可配置 fallback） |
| **Node.js 运行时** | 系统 Node.js | 内嵌精简 Node | **系统 Node.js**（初期） |
| **Sidecar 生命周期** | 按需启动 | 应用启动时预加载 | **按需启动**（初期） |

### 9.3 立即可以开始的工作

1. **创建 src-sidecar 目录**
   ```bash
   mkdir -p src-sidecar/src
   cd src-sidecar
   npm init -y
   npm install @anthropic-ai/claude-agent-sdk
   npm install -D typescript esbuild @types/node
   ```

2. **验证 SDK V2 API**
   ```typescript
   // test-sdk.ts
   import { unstable_v2_prompt } from "@anthropic-ai/claude-agent-sdk";

   const result = await unstable_v2_prompt("Hello!", {
     model: "claude-sonnet-4-5-20250929"
   });
   console.log(result);
   ```

3. **运行测试**
   ```bash
   npx tsx test-sdk.ts
   ```

---

## 十、总结

### 10.1 方案特点

- **渐进式迁移**：保留 CLI 模式作为 fallback，降低风险
- **复用现有模式**：参考 `cli_runner.rs`、`codexConverter.ts` 等成熟实现
- **最小前端改动**：消息格式转换在 Sidecar 层完成，前端基本无感
- **完整斜杠命令**：SDK V2 原生支持所有斜杠命令

### 10.2 预期收益

| 收益 | 说明 |
|------|------|
| 斜杠命令支持 | `/compact`, `/clear`, `/cost`, `/help` 及自定义命令 |
| 更好的会话管理 | V2 `send()/receive()` 模式更适合 GUI 应用 |
| 原生权限控制 | SDK 内置权限模式，无需命令行参数拼接 |
| 未来兼容性 | SDK 会随 Claude Code 更新，自动获得新功能 |

### 10.3 下一步行动

1. ✅ 方案文档已完成
2. ⏳ 等待确认：是否开始实施？
3. ⏳ 如果开始：从 **Step 1 (创建 Sidecar 骨架)** 开始
