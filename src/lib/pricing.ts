/**
 * 统一的 AI 模型定价模块
 * ⚠️ MUST MATCH: src-tauri/src/commands/usage.rs::ModelPricing
 *
 * Claude 定价：https://platform.claude.com/docs/en/about-claude/pricing
 * Codex 定价：https://platform.openai.com/docs/pricing (codex-mini-latest)
 * 价格单位：美元/百万 tokens
 * Last Updated: December 2025
 */

export interface ModelPricing {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

/**
 * 模型定价常量（每百万 tokens）
 * 来源：各厂商官方定价
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // ============================================================================
  // Claude Models (Anthropic)
  // ============================================================================

  // Claude 4.5 Series (Latest - December 2025)
  'claude-opus-4.5': {
    input: 5.0,
    output: 25.0,
    cacheWrite: 6.25,
    cacheRead: 0.50
  },
  'claude-sonnet-4.5': {
    input: 3.0,
    output: 15.0,
    cacheWrite: 3.75,
    cacheRead: 0.30
  },
  'claude-haiku-4.5': {
    input: 1.0,
    output: 5.0,
    cacheWrite: 1.25,
    cacheRead: 0.10
  },

  // Claude 4.1 Series
  'claude-opus-4.1': {
    input: 15.0,
    output: 75.0,
    cacheWrite: 18.75,
    cacheRead: 1.50
  },

  // ============================================================================
  // Codex Models (OpenAI)
  // Source: https://openrouter.ai/openai/ (2025-12 实际定价)
  // Note: Codex 使用 ChatGPT 订阅时按会话限制计费，API Key 用户按 token 计费
  // ============================================================================

  // GPT-5.1-Codex 系列 - Codex CLI 主要使用的模型
  // Context: 400K tokens
  'gpt-5.1-codex': {
    input: 1.25,      // $1.25 / 1M input tokens
    output: 10.00,    // $10.00 / 1M output tokens
    cacheWrite: 1.5625, // input * 1.25
    cacheRead: 0.125   // input * 0.1
  },
  'gpt-5.1-codex-mini': {
    input: 0.25,      // $0.25 / 1M input tokens
    output: 2.00,     // $2.00 / 1M output tokens
    cacheWrite: 0.3125,
    cacheRead: 0.025
  },
  'gpt-5.1-codex-max': {
    input: 1.25,      // $1.25 / 1M input tokens (same as base)
    output: 10.00,    // $10.00 / 1M output tokens
    cacheWrite: 1.5625,
    cacheRead: 0.125
  },

  // GPT-5.2 系列 - 最新模型
  // Context: 400K tokens, Max Output: 128K tokens
  'gpt-5.2': {
    input: 1.75,      // $1.75 / 1M input tokens
    output: 14.00,    // $14.00 / 1M output tokens
    cacheWrite: 2.1875,
    cacheRead: 0.175
  },
  // GPT-5.2 variants (Instant, Thinking, Pro) - 同定价
  'gpt-5.2-instant': {
    input: 1.75,
    output: 14.00,
    cacheWrite: 2.1875,
    cacheRead: 0.175
  },
  'gpt-5.2-thinking': {
    input: 1.75,
    output: 14.00,
    cacheWrite: 2.1875,
    cacheRead: 0.175
  },
  'gpt-5.2-pro': {
    input: 1.75,
    output: 14.00,
    cacheWrite: 2.1875,
    cacheRead: 0.175
  },

  // o4-mini (Codex 底层模型之一)
  'o4-mini': {
    input: 1.10,
    output: 4.40,
    cacheWrite: 1.375,
    cacheRead: 0.11
  },

  // ============================================================================
  // Default fallback (use latest Sonnet 4.5 pricing)
  // ============================================================================
  'default': {
    input: 3.0,
    output: 15.0,
    cacheWrite: 3.75,
    cacheRead: 0.30
  }
};

/**
 * 根据模型名称获取定价
 * ⚠️ MUST MATCH: Backend logic in usage.rs::parse_model_family
 *
 * @param model - 模型名称或标识符
 * @param engine - 引擎类型（claude/codex/gemini）
 * @returns 模型定价对象
 */
export function getPricingForModel(model?: string, engine?: string): ModelPricing {
  if (!model) {
    // 根据引擎选择默认定价
    if (engine === 'codex') {
      return MODEL_PRICING['codex-mini'];
    }
    return MODEL_PRICING['default'];
  }

  // Normalize: lowercase + remove common prefixes/suffixes
  let normalized = model.toLowerCase();
  normalized = normalized.replace('anthropic.', '');
  normalized = normalized.replace('openai.', '');
  normalized = normalized.replace('-v1:0', '');

  // Handle @ symbol for Vertex AI format
  const atIndex = normalized.indexOf('@');
  if (atIndex !== -1) {
    normalized = normalized.substring(0, atIndex);
  }

  // ============================================================================
  // Codex Models (OpenAI)
  // ============================================================================

  // GPT-5.1-Codex 系列
  if (normalized.includes('5.1-codex-max') || normalized.includes('5_1_codex_max')) {
    return MODEL_PRICING['gpt-5.1-codex-max'];
  }
  if (normalized.includes('5.1-codex-mini') || normalized.includes('5_1_codex_mini')) {
    return MODEL_PRICING['gpt-5.1-codex-mini'];
  }
  if (normalized.includes('5.1-codex') || normalized.includes('5_1_codex')) {
    return MODEL_PRICING['gpt-5.1-codex'];
  }

  // GPT-5.2 系列 (Instant, Thinking, Pro variants)
  if (normalized.includes('5.2-pro') || normalized.includes('5_2_pro')) {
    return MODEL_PRICING['gpt-5.2-pro'];
  }
  if (normalized.includes('5.2-thinking') || normalized.includes('5_2_thinking')) {
    return MODEL_PRICING['gpt-5.2-thinking'];
  }
  if (normalized.includes('5.2-instant') || normalized.includes('5_2_instant')) {
    return MODEL_PRICING['gpt-5.2-instant'];
  }
  if (normalized.includes('gpt-5.2') || normalized.includes('gpt_5_2') || normalized.includes('5.2')) {
    return MODEL_PRICING['gpt-5.2'];
  }

  // o4-mini (Codex 底层模型)
  if (normalized.includes('o4-mini') || normalized.includes('o4_mini')) {
    return MODEL_PRICING['o4-mini'];
  }

  // 通用 Codex 匹配 - 默认使用 gpt-5.1-codex
  if (normalized.includes('codex')) {
    return MODEL_PRICING['gpt-5.1-codex'];
  }

  // ============================================================================
  // Claude Models (Anthropic)
  // ============================================================================

  // Claude 4.5 Series (Latest)
  if (normalized.includes('opus') && (normalized.includes('4.5') || normalized.includes('4-5'))) {
    return MODEL_PRICING['claude-opus-4.5'];
  }
  if (normalized.includes('haiku') && (normalized.includes('4.5') || normalized.includes('4-5'))) {
    return MODEL_PRICING['claude-haiku-4.5'];
  }
  if (normalized.includes('sonnet') && (normalized.includes('4.5') || normalized.includes('4-5'))) {
    return MODEL_PRICING['claude-sonnet-4.5'];
  }

  // Claude 4.1 Series
  if (normalized.includes('opus') && (normalized.includes('4.1') || normalized.includes('4-1'))) {
    return MODEL_PRICING['claude-opus-4.1'];
  }

  // Generic family detection (fallback - MUST match backend)
  if (normalized.includes('haiku')) {
    return MODEL_PRICING['claude-haiku-4.5']; // Default to latest
  }
  if (normalized.includes('opus')) {
    return MODEL_PRICING['claude-opus-4.5']; // Default to latest
  }
  if (normalized.includes('sonnet')) {
    return MODEL_PRICING['claude-sonnet-4.5']; // Default to latest
  }

  // Codex 引擎使用 Codex 默认定价
  if (engine === 'codex') {
    return MODEL_PRICING['codex-mini'];
  }

  // Unknown model - use default
  console.warn(`[pricing] Unknown model: '${model}'. Using default pricing.`);
  return MODEL_PRICING['default'];
}

/**
 * 计算单个消息的成本
 * @param tokens - token 使用统计
 * @param model - 模型名称
 * @param engine - 引擎类型（claude/codex/gemini）
 * @returns 成本（美元）
 */
export function calculateMessageCost(
  tokens: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_tokens: number;
    cache_read_tokens: number;
  },
  model?: string,
  engine?: string
): number {
  const pricing = getPricingForModel(model, engine);

  const inputCost = (tokens.input_tokens / 1_000_000) * pricing.input;
  const outputCost = (tokens.output_tokens / 1_000_000) * pricing.output;
  const cacheWriteCost = (tokens.cache_creation_tokens / 1_000_000) * pricing.cacheWrite;
  const cacheReadCost = (tokens.cache_read_tokens / 1_000_000) * pricing.cacheRead;

  return inputCost + outputCost + cacheWriteCost + cacheReadCost;
}

/**
 * 格式化成本显示
 * @param amount - 成本金额（美元）
 * @returns 格式化的字符串
 */
export function formatCost(amount: number): string {
  if (amount === 0) return '$0.00';
  if (amount < 0.01) {
    // 小于 1 美分时显示为美分
    const cents = amount * 100;
    return `$${cents.toFixed(3)}¢`;
  }
  return `$${amount.toFixed(4)}`;
}

/**
 * 格式化时长
 * @param seconds - 秒数
 * @returns 格式化的时长字符串（如 "6m 19s" 或 "6h 33m"）
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);

  if (minutes < 60) {
    return remainingSeconds > 0
      ? `${minutes}m ${remainingSeconds}s`
      : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes > 0
    ? `${hours}h ${remainingMinutes}m`
    : `${hours}h`;
}
