import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const PROMPT_ASSET_ROOT = join(dirname(fileURLToPath(import.meta.url)), 'prompt-assets');
const assetCache = new Map();

export function readPromptAssetSync(relativePath) {
  const normalized = typeof relativePath === 'string'
    ? relativePath.replace(/^\/+/, '').trim()
    : '';
  if (!normalized) return '';
  if (assetCache.has(normalized)) {
    return assetCache.get(normalized);
  }
  const content = readFileSync(join(PROMPT_ASSET_ROOT, normalized), 'utf8');
  assetCache.set(normalized, content);
  return content;
}

export function renderPromptTemplate(template, values = {}) {
  return String(template || '').replace(/\{\{([A-Z0-9_]+)\}\}/g, (_match, key) => {
    const value = values[key];
    return value == null ? '' : String(value);
  });
}

export function renderPromptAssetSync(relativePath, values = {}) {
  return renderPromptTemplate(readPromptAssetSync(relativePath), values);
}
