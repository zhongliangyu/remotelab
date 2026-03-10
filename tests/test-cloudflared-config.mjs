#!/usr/bin/env node
import assert from 'assert/strict';
import { parseCloudflaredIngress, selectCloudflaredAccessDomain } from './lib/cloudflared-config.mjs';

const baseConfig = `tunnel: claude-code-remote
credentials-file: /Users/example/.cloudflared/example-tunnel.json
protocol: http2

ingress:
  - hostname: terminal.example.com
    service: http://127.0.0.1:7681
  - hostname: legacy.example.com
    service: http://127.0.0.1:7690
  - hostname: test.example.com
    service: http://127.0.0.1:7692
  - service: http_status:404
`;

const dualProdConfig = `tunnel: claude-code-remote
credentials-file: /Users/example/.cloudflared/example-tunnel.json
protocol: http2

ingress:
  - hostname: terminal.example.com
    service: http://127.0.0.1:7681
  - hostname: chat.example.com
    service: http://127.0.0.1:7690
  - hostname: legacy.example.com
    service: http://127.0.0.1:7690
  - hostname: test.example.com
    service: http://127.0.0.1:7692
  - service: http_status:404
`;

assert.deepEqual(parseCloudflaredIngress(baseConfig), [
  {
    hostname: 'terminal.example.com',
    service: 'http://127.0.0.1:7681',
  },
  {
    hostname: 'legacy.example.com',
    service: 'http://127.0.0.1:7690',
  },
  {
    hostname: 'test.example.com',
    service: 'http://127.0.0.1:7692',
  },
]);

assert.equal(
  await selectCloudflaredAccessDomain(baseConfig, {
    hostnameResolves: async (hostname) => hostname === 'legacy.example.com',
  }),
  'legacy.example.com'
);

assert.equal(
  await selectCloudflaredAccessDomain(dualProdConfig, {
    hostnameResolves: async (hostname) => hostname === 'legacy.example.com',
  }),
  'legacy.example.com'
);

assert.equal(
  await selectCloudflaredAccessDomain(dualProdConfig, {
    hostnameResolves: async (hostname) => [
      'chat.example.com',
      'legacy.example.com',
    ].includes(hostname),
  }),
  'chat.example.com'
);

assert.equal(
  await selectCloudflaredAccessDomain('ingress:\n  - hostname: terminal.example.com\n    service: http://127.0.0.1:7681\n', {
    hostnameResolves: async () => true,
  }),
  null
);

console.log('test-cloudflared-config: ok');
