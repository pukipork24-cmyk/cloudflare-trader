// Agent Registry — imports individual agent configs

import { technical } from './technical.js';
import { sentiment } from './sentiment.js';
import { fundamental } from './fundamental.js';
import { risk } from './risk.js';
import { portfolio } from './portfolio.js';
import { intelligence } from './intelligence.js';
import { execution } from './execution.js';

export const AGENTS = { technical, sentiment, fundamental, risk, portfolio, intelligence, execution };

export const AGENT_SYSTEM_PROMPTS = {
  technical: technical.systemPrompt,
  sentiment: sentiment.systemPrompt,
  fundamental: fundamental.systemPrompt,
  risk: risk.systemPrompt,
  portfolio: portfolio.systemPrompt,
  intelligence: intelligence.systemPrompt,
  execution: execution.systemPrompt,
};

// ── Per-Agent AI Provider Config ───────────────────────────────────────────
// Each agent can use a different provider, model, and API key.
// Supported providers: 'deepseek', 'openai', 'anthropic', 'groq'
//
// To add your API key, run: npx wrangler secret put <NAME>
// e.g. for DEEPSEEK_API_KEY: npx wrangler secret put DEEPSEEK_API_KEY

export const AI_PROVIDER = {
  technical: {
    provider: 'deepseek',
    model: 'deepseek-chat',
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    apiKeyEnvVar: 'DEEPSEEK_API_KEY',
  },
  sentiment: {
    provider: 'deepseek',
    model: 'deepseek-chat',
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    apiKeyEnvVar: 'DEEPSEEK_API_KEY',
  },
  fundamental: {
    provider: 'deepseek',
    model: 'deepseek-reasoner',
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    apiKeyEnvVar: 'DEEPSEEK_API_KEY',
  },
  risk: {
    provider: 'deepseek',
    model: 'deepseek-chat',
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    apiKeyEnvVar: 'DEEPSEEK_API_KEY',
  },
  portfolio: {
    provider: 'deepseek',
    model: 'deepseek-chat',
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    apiKeyEnvVar: 'DEEPSEEK_API_KEY',
  },
  intelligence: {
    provider: 'deepseek',
    model: 'deepseek-chat',
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    apiKeyEnvVar: 'DEEPSEEK_API_KEY',
  },
  execution: {
    provider: 'deepseek',
    model: 'deepseek-chat',
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    apiKeyEnvVar: 'DEEPSEEK_API_KEY',
  },
};