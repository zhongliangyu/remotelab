import { Resolver } from 'dns/promises';

const publicResolver = new Resolver();
publicResolver.setServers(['1.1.1.1', '1.0.0.1']);

function normalizeHostname(hostname) {
  return typeof hostname === 'string' ? hostname.trim() : '';
}

function isPreferredHostname(hostname) {
  return normalizeHostname(hostname).includes('remotelab');
}

function serviceTargetsPort(service, port) {
  if (!service) return false;
  try {
    const url = new URL(service);
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    const normalizedPort = url.port || (url.protocol === 'https:' ? '443' : '80');
    return Number(normalizedPort) === port;
  } catch {
    return false;
  }
}

export function parseCloudflaredIngress(content) {
  if (!content) return [];

  const entries = [];
  let current = null;

  for (const line of content.split(/\r?\n/)) {
    const hostnameMatch = line.match(/^\s*-\s*hostname:\s*(\S+)/);
    if (hostnameMatch) {
      current = {
        hostname: normalizeHostname(hostnameMatch[1]),
        service: null,
      };
      entries.push(current);
      continue;
    }

    const serviceMatch = line.match(/^\s*service:\s*(\S+)/);
    if (serviceMatch && current && !current.service) {
      current.service = serviceMatch[1].trim();
    }
  }

  return entries;
}

async function hostnameResolvesPublicDns(hostname) {
  const checks = await Promise.allSettled([
    publicResolver.resolve4(hostname),
    publicResolver.resolve6(hostname),
  ]);

  return checks.some((result) => result.status === 'fulfilled' && Array.isArray(result.value) && result.value.length > 0);
}

export async function selectCloudflaredAccessDomain(
  content,
  { port = 7690, hostnameResolves = hostnameResolvesPublicDns } = {}
) {
  const candidates = parseCloudflaredIngress(content).filter((entry) => serviceTargetsPort(entry.service, port));
  if (candidates.length === 0) return null;

  const reachability = new Map();
  for (const entry of candidates) {
    try {
      reachability.set(entry.hostname, await hostnameResolves(entry.hostname));
    } catch {
      reachability.set(entry.hostname, false);
    }
  }

  const reachablePreferred = candidates.find((entry) => isPreferredHostname(entry.hostname) && reachability.get(entry.hostname));
  if (reachablePreferred) return reachablePreferred.hostname;

  const reachableFallback = candidates.find((entry) => reachability.get(entry.hostname));
  if (reachableFallback) return reachableFallback.hostname;

  const preferredFallback = candidates.find((entry) => isPreferredHostname(entry.hostname));
  if (preferredFallback) return preferredFallback.hostname;

  return candidates[0].hostname;
}
