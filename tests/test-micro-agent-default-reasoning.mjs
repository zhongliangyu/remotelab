#!/usr/bin/env node
import assert from 'assert/strict';
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(__dirname);
const tempHome = mkdtempSync(join(tmpdir(), 'remotelab-micro-agent-default-reasoning-'));
const fakeBin = join(tempHome, '.local', 'bin');
const configDir = join(tempHome, '.config', 'remotelab');

mkdirSync(fakeBin, { recursive: true });
mkdirSync(configDir, { recursive: true });

writeFileSync(join(fakeBin, 'codex'), '#!/bin/sh\nexit 0\n', 'utf8');
chmodSync(join(fakeBin, 'codex'), 0o755);

writeFileSync(
  join(configDir, 'tools.json'),
  `${JSON.stringify([
    {
      id: 'micro-agent',
      name: 'Micro Agent',
      toolProfile: 'micro-agent',
      command: 'codex',
      runtimeFamily: 'codex-json',
      models: [{ id: 'gpt-5.4', label: 'gpt-5.4' }],
      reasoning: { kind: 'none', label: 'Thinking' },
    },
    {
      id: 'micro-agent-alt',
      name: 'Micro Agent Alt',
      toolProfile: 'micro-agent',
      command: 'codex',
      runtimeFamily: 'codex-json',
      models: [{ id: 'gpt-5.4-mini', label: 'gpt-5.4-mini', defaultEffort: 'xhigh' }],
      reasoning: {
        kind: 'enum',
        label: 'Thinking',
        levels: ['low', 'medium', 'high', 'xhigh'],
        default: 'xhigh',
      },
    },
  ], null, 2)}\n`,
  'utf8',
);

process.env.HOME = tempHome;
process.env.PATH = `${fakeBin}:${process.env.PATH || ''}`;

const { getAvailableTools } = await import(pathToFileURL(join(repoRoot, 'lib', 'tools.mjs')).href);

try {
  const tools = getAvailableTools();
  for (const toolId of ['micro-agent', 'micro-agent-alt']) {
    const tool = tools.find((entry) => entry.id === toolId);
    assert.ok(tool, `${toolId} should be available`);
    assert.deepEqual(tool.reasoning, {
      kind: 'enum',
      label: 'Thinking',
      levels: ['low', 'medium', 'high', 'xhigh'],
      default: 'medium',
    });
    assert.equal(tool.models?.[0]?.defaultReasoning, 'medium');
  }
} finally {
  rmSync(tempHome, { recursive: true, force: true });
}

console.log('test-micro-agent-default-reasoning: ok');
