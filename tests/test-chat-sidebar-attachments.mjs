#!/usr/bin/env node
import assert from 'assert/strict';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(__dirname);
const composerStoreSource = readFileSync(join(repoRoot, 'static', 'chat', 'composer-store.js'), 'utf8');
const sidebarUiSource = readFileSync(join(repoRoot, 'static', 'chat', 'sidebar-ui.js'), 'utf8');

function extractFunctionSource(source, functionName) {
  const marker = `function ${functionName}`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${functionName} should exist in sidebar-ui.js`);
  const paramsStart = source.indexOf('(', start);
  assert.notEqual(paramsStart, -1, `${functionName} should have parameters`);
  let paramsDepth = 0;
  let braceStart = -1;
  for (let index = paramsStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '(') paramsDepth += 1;
    if (char === ')') {
      paramsDepth -= 1;
      if (paramsDepth === 0) {
        braceStart = source.indexOf('{', index);
        break;
      }
    }
  }
  assert.notEqual(braceStart, -1, `${functionName} should have a body`);
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }
  throw new Error(`Unable to extract ${functionName}`);
}

const buildPendingAttachmentSource = extractFunctionSource(sidebarUiSource, 'buildPendingAttachment');
const addAttachmentFilesSource = extractFunctionSource(sidebarUiSource, 'addAttachmentFiles');

function createHarness({ locked = false } = {}) {
  const state = {
    objectUrls: [],
    renderCalls: 0,
  };
  const context = {
    console,
    currentSessionId: 'session-a',
    URL: {
      createObjectURL(file) {
        const objectUrl = `blob:${file.name}`;
        state.objectUrls.push(objectUrl);
        return objectUrl;
      },
    },
    renderImagePreviews() {
      state.renderCalls += 1;
    },
    hasPendingComposerSend() {
      return locked;
    },
  };
  context.globalThis = context;
  vm.runInNewContext(
    [
      composerStoreSource,
      buildPendingAttachmentSource,
      addAttachmentFilesSource,
      'globalThis.addAttachmentFiles = addAttachmentFiles;',
    ].join('\n\n'),
    context,
    { filename: 'static/chat/sidebar-ui.js' },
  );
  return { context, state };
}

const firstBatch = Array.from({ length: 3 }, (_, index) => ({
  name: `shot-${index + 1}.png`,
  type: 'image/png',
  size: 1024 + index,
}));
const secondBatch = Array.from({ length: 3 }, (_, index) => ({
  name: `shot-${index + 4}.png`,
  type: 'image/png',
  size: 2048 + index,
}));

const openHarness = createHarness();
await openHarness.context.addAttachmentFiles(firstBatch);
await openHarness.context.addAttachmentFiles(secondBatch);
assert.equal(openHarness.context.getComposerAttachmentsState('session-a').length, 6, 'attachment picker should preserve every selected file instead of truncating at four');
assert.deepEqual(
  Array.from(openHarness.context.getComposerAttachmentsState('session-a'), (image) => image.originalName),
  [...firstBatch, ...secondBatch].map((file) => file.name),
  'attachment picker should append each batch in order',
);
assert.equal(openHarness.state.objectUrls.length, 6, 'attachment picker should create a preview URL for every selected file');
assert.equal(openHarness.state.renderCalls, 2, 'attachment picker should rerender after each batch');

const lockedHarness = createHarness({ locked: true });
await lockedHarness.context.addAttachmentFiles([...firstBatch, ...secondBatch]);
assert.equal(lockedHarness.context.getComposerAttachmentsState('session-a').length, 0, 'attachment picker should ignore new files while a send is already pending');
assert.equal(lockedHarness.state.objectUrls.length, 0, 'locked composer should not allocate preview URLs');
assert.equal(lockedHarness.state.renderCalls, 0, 'locked composer should not rerender the preview strip');

console.log('test-chat-sidebar-attachments: ok');
