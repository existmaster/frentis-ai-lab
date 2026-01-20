/**
 * Configuration loader
 */

import { z } from 'zod';
import type { AgentConfig } from '../types';

const envSchema = z.object({
  GITHUB_TOKEN: z.string().optional(), // Optional when using gh CLI
  GITHUB_WEBHOOK_SECRET: z.string().default('dev-secret'), // Default for local testing
  ANTHROPIC_API_KEY: z.string().optional(),
  PORT: z.string().default('3000'),
  HOST: z.string().default('0.0.0.0'),
});

export function loadConfig(): AgentConfig {
  const env = envSchema.parse(process.env);

  return {
    github: {
      token: env.GITHUB_TOKEN,
      webhookSecret: env.GITHUB_WEBHOOK_SECRET, // 'dev-secret' for local testing
    },
    claude: {
      apiKey: env.ANTHROPIC_API_KEY,
    },
    server: {
      port: parseInt(env.PORT, 10),
      host: env.HOST,
    },
    repos: [], // Will be loaded from repos.json or added via API
  };
}

export function loadReposConfig(configPath?: string): AgentConfig['repos'] {
  const path = configPath || `${import.meta.dir}/../../repos.json`;
  try {
    const content = require('fs').readFileSync(path, 'utf-8');
    console.log('[CONFIG] Loaded repos:', content);
    return JSON.parse(content);
  } catch (e) {
    console.log('[CONFIG] Failed to load repos.json:', e);
    return [];
  }
}
