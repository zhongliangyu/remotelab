#!/usr/bin/env node
import assert from 'assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import http from 'http';
import { spawn } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';
import { pathToFileURL } from 'url';

const repoRoot = process.cwd();
const tempHome = mkdtempSync(join(tmpdir(), 'remotelab-agent-mail-worker-'));
process.env.HOME = tempHome;

const mailboxRoot = join(tempHome, '.config', 'remotelab', 'agent-mailbox');
mkdirSync(join(tempHome, '.config', 'remotelab'), { recursive: true });
writeFileSync(join(tempHome, '.config', 'remotelab', 'auth.json'), JSON.stringify({
  token: 'abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234',
}, null, 2));

const {
  buildEmailThreadExternalTriggerId,
  findQueueItem,
  initializeMailbox,
  ingestRawMessage,
  saveMailboxAutomation,
} = await import(pathToFileURL(join(repoRoot, 'lib', 'agent-mailbox.mjs')).href);

const requests = [];
const sessionCreates = [];
const messageSubmissions = [];
const server = http.createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) {
    body += chunk.toString();
  }
  requests.push({ method: req.method, url: req.url, headers: req.headers, body });

  if (req.method === 'GET' && req.url?.startsWith('/?token=')) {
    res.writeHead(302, {
      Location: '/',
      'Set-Cookie': 'session_token=test-cookie; HttpOnly; Path=/',
    });
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/api/sessions') {
    const payload = JSON.parse(body || '{}');
    assert.equal(Array.isArray(payload.completionTargets), true);
    assert.equal(payload.completionTargets.length, 1);
    assert.equal(payload.completionTargets[0].type, 'email');
    sessionCreates.push(payload);
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ session: { id: 'sess_1' } }));
    return;
  }

  if (req.method === 'POST' && req.url === '/api/sessions/sess_1/messages') {
    const payload = JSON.parse(body || '{}');
    assert.equal(payload.requestId.startsWith('mailbox_reply_'), true);
    assert.match(payload.text, /Original email:/);
    messageSubmissions.push(payload);
    res.writeHead(202, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      duplicate: false,
      run: { id: `run_${messageSubmissions.length}` },
      session: { id: 'sess_1' },
    }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();

try {
  initializeMailbox({
    rootDir: mailboxRoot,
    name: 'Rowan',
    localPart: 'rowan',
    domain: 'example.com',
    allowEmails: ['owner@example.com'],
  });

  saveMailboxAutomation(mailboxRoot, {
    allowlistAutoApprove: true,
    chatBaseUrl: `http://127.0.0.1:${port}`,
    session: {
      folder: '~',
      tool: 'codex',
      group: 'Mail',
      description: 'Inbound email',
      systemPrompt: 'Reply with plain text only.',
    },
  });

  const ingested = ingestRawMessage(
    [
      'From: owner@example.com',
      'To: rowan@example.com',
      'Subject: hello!',
      'Message-ID: <root-thread@example.com>',
      'Content-Type: text/plain; charset=UTF-8',
      '',
      'please take a response to test!',
    ].join('\n'),
    'test.eml',
    mailboxRoot,
    { text: 'please take a response to test!' },
  );
  const approved = findQueueItem(ingested.id, mailboxRoot)?.item;
  assert.equal(approved?.queue, 'approved');
  assert.equal(approved?.review?.status, 'auto_approved');

  const firstWorker = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(repoRoot, 'scripts', 'agent-mail-worker.mjs'), '--once', '--root', mailboxRoot], {
      cwd: repoRoot,
      env: { ...process.env, HOME: tempHome },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `worker exited with ${code}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });

  const firstSummary = JSON.parse(firstWorker.stdout);
  assert.equal(firstSummary.processed, 1);
  assert.equal(firstSummary.failures.length, 0);
  assert.equal(requests.length, 3);

  const expectedThreadTriggerId = buildEmailThreadExternalTriggerId({
    messageId: '<root-thread@example.com>',
  });
  assert.equal(sessionCreates.length, 1);
  assert.equal(sessionCreates[0].externalTriggerId, expectedThreadTriggerId);
  assert.equal(sessionCreates[0].completionTargets[0].inReplyTo, '<root-thread@example.com>');
  assert.equal(sessionCreates[0].completionTargets[0].references, '<root-thread@example.com>');
  assert.match(messageSubmissions[0].text, /please take a response to test!/);

  const updated = findQueueItem(approved.id, mailboxRoot)?.item;
  assert.equal(updated?.status, 'processing_for_reply');
  assert.equal(updated?.automation?.status, 'processing_for_reply');
  assert.equal(updated?.automation?.sessionId, 'sess_1');
  assert.equal(updated?.automation?.runId, 'run_1');

  const followUpIngested = ingestRawMessage(
    [
      'From: owner@example.com',
      'To: rowan@example.com',
      'Subject: Re: hello!',
      'Message-ID: <follow-up@example.com>',
      'In-Reply-To: <root-thread@example.com>',
      'References: <root-thread@example.com>',
      'Content-Type: text/plain; charset=UTF-8',
      '',
      'here is the follow-up reply in the same thread.',
    ].join('\n'),
    'follow-up.eml',
    mailboxRoot,
    { text: 'here is the follow-up reply in the same thread.' },
  );
  const approvedFollowUp = findQueueItem(followUpIngested.id, mailboxRoot)?.item;
  assert.equal(approvedFollowUp?.queue, 'approved');
  assert.equal(approvedFollowUp?.review?.status, 'auto_approved');

  const secondWorker = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(repoRoot, 'scripts', 'agent-mail-worker.mjs'), '--once', '--root', mailboxRoot], {
      cwd: repoRoot,
      env: { ...process.env, HOME: tempHome },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `worker exited with ${code}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });

  const secondSummary = JSON.parse(secondWorker.stdout);
  assert.equal(secondSummary.processed, 1);
  assert.equal(secondSummary.failures.length, 0);
  assert.equal(requests.length, 6);
  assert.equal(sessionCreates.length, 2);
  assert.equal(messageSubmissions.length, 2);
  assert.equal(sessionCreates[1].externalTriggerId, expectedThreadTriggerId);
  assert.equal(sessionCreates[1].completionTargets[0].inReplyTo, '<follow-up@example.com>');
  assert.equal(sessionCreates[1].completionTargets[0].references, '<root-thread@example.com> <follow-up@example.com>');
  assert.match(messageSubmissions[1].text, /here is the follow-up reply in the same thread\./);

  const updatedFollowUp = findQueueItem(approvedFollowUp.id, mailboxRoot)?.item;
  assert.equal(updatedFollowUp?.status, 'processing_for_reply');
  assert.equal(updatedFollowUp?.automation?.status, 'processing_for_reply');
  assert.equal(updatedFollowUp?.automation?.sessionId, 'sess_1');
  assert.equal(updatedFollowUp?.automation?.runId, 'run_2');
} finally {
  server.close();
  rmSync(tempHome, { recursive: true, force: true });
}

console.log('agent mail worker tests passed');
