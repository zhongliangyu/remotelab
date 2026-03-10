#!/usr/bin/env node
import assert from 'assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  findQueueItem,
  getMailboxStatus,
  initializeMailbox,
  ingestRawMessage,
  mailboxPaths,
  saveMailboxAutomation,
} from './lib/agent-mailbox.mjs';

function testCloudflareWebhookHealthy() {
  const rootDir = mkdtempSync(join(tmpdir(), 'remotelab-agent-mailbox-healthy-'));
  try {
    initializeMailbox({
      rootDir,
      name: 'Rowan',
      localPart: 'rowan',
      domain: 'example.com',
      allowEmails: ['owner@example.com'],
    });
    writeFileSync(
      mailboxPaths(rootDir).bridgeFile,
      `${JSON.stringify({
        provider: 'cloudflare_email_worker',
        emailAddress: 'rowan@example.com',
        validation: {
          publicHealth: 'pass',
        },
      }, null, 2)}\n`,
      'utf8',
    );

    const status = getMailboxStatus(rootDir);
    assert.equal(status.effectiveStatus, 'public_webhook_healthy');
    assert.equal(status.publicIngress, 'public_webhook_healthy');
    assert.equal(status.diagnostics.length, 0);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
}

function testCloudflareQueueReady() {
  const rootDir = mkdtempSync(join(tmpdir(), 'remotelab-agent-mailbox-ready-'));
  try {
    initializeMailbox({
      rootDir,
      name: 'Rowan',
      localPart: 'rowan',
      domain: 'example.com',
      allowEmails: ['owner@example.com'],
    });
    writeFileSync(
      mailboxPaths(rootDir).bridgeFile,
      `${JSON.stringify({
        provider: 'cloudflare_email_worker',
        emailAddress: 'rowan@example.com',
        validation: {
          publicHealth: 'pass',
          queueReadyForRealMail: true,
        },
      }, null, 2)}\n`,
      'utf8',
    );

    const status = getMailboxStatus(rootDir);
    assert.equal(status.effectiveStatus, 'ready_for_external_mail');
    assert.equal(status.publicIngress, 'ready_for_external_mail');
    assert.equal(status.diagnostics.length, 0);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
}

function testCloudflareValidatedDelivery() {
  const rootDir = mkdtempSync(join(tmpdir(), 'remotelab-agent-mailbox-validated-'));
  try {
    initializeMailbox({
      rootDir,
      name: 'Rowan',
      localPart: 'rowan',
      domain: 'example.com',
      allowEmails: ['owner@example.com'],
    });
    writeFileSync(
      mailboxPaths(rootDir).bridgeFile,
      `${JSON.stringify({
        provider: 'cloudflare_email_worker',
        emailAddress: 'rowan@example.com',
        validation: {
          publicHealth: 'pass',
          queueReadyForRealMail: true,
          realExternalMailValidated: true,
        },
      }, null, 2)}\n`,
      'utf8',
    );

    const status = getMailboxStatus(rootDir);
    assert.equal(status.effectiveStatus, 'external_mail_validated');
    assert.equal(status.publicIngress, 'external_mail_validated');
    assert.equal(status.diagnostics.length, 0);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
}

function testAllowlistAutoApprove() {
  const rootDir = mkdtempSync(join(tmpdir(), 'remotelab-agent-mailbox-auto-approve-'));
  try {
    initializeMailbox({
      rootDir,
      name: 'Rowan',
      localPart: 'rowan',
      domain: 'example.com',
      allowEmails: ['owner@example.com'],
    });
    saveMailboxAutomation(rootDir, {
      allowlistAutoApprove: true,
      autoApproveReviewer: 'auto-test',
    });

    const ingested = ingestRawMessage(
      [
        'From: owner@example.com',
        'To: rowan@example.com',
        'Subject: hello!',
        'Content-Type: text/plain; charset=UTF-8',
        '',
        'please take a response to test!',
      ].join('\n'),
      'test.eml',
      rootDir,
      { text: 'please take a response to test!' },
    );

    const located = findQueueItem(ingested.id, rootDir);
    assert.equal(located?.queueName, 'approved');
    assert.equal(located?.item?.status, 'approved_for_ai');
    assert.equal(located?.item?.review?.status, 'auto_approved');
    assert.equal(located?.item?.review?.reviewer, 'auto-test');
    assert.equal(located?.item?.security?.aiEligible, true);
    assert.equal(located?.item?.security?.manualReviewRequired, false);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
}

testCloudflareWebhookHealthy();
testCloudflareQueueReady();
testCloudflareValidatedDelivery();
testAllowlistAutoApprove();
console.log('agent mailbox tests passed');
