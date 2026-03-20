function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function isStrongMultiWorkstreamCue(text) {
  return /(?:需要|值得|应该)?(?:重点)?(?:关注|处理|回答|讨论|看)(?:的)?(?:两点|三点|几点|几件事|几个问题|几个事情)|(?:two|three|multiple|several)\s+(?:things|topics|questions|tracks|workstreams|asks)/i.test(text);
}

function isAgendaMarker(line) {
  return /^\s*(?:[-*+]|\d+[.)]|[①②③④⑤⑥⑦⑧⑨⑩]|[一二三四五六七八九十]+[、.．)])\s+/.test(line);
}

function stripAgendaMarker(line) {
  return line.replace(/^\s*(?:[-*+]|\d+[.)]|[①②③④⑤⑥⑦⑧⑨⑩]|[一二三四五六七八九十]+[、.．)])\s+/, '').trim();
}

function extractAgendaItems(text) {
  const lines = String(text || '').split(/\r?\n/);
  const items = [];
  let current = '';

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      if (current) {
        items.push(normalizeWhitespace(current));
        current = '';
      }
      continue;
    }
    if (isAgendaMarker(line)) {
      if (current) {
        items.push(normalizeWhitespace(current));
      }
      current = stripAgendaMarker(line);
      continue;
    }
    if (current) {
      current = `${current} ${line.trim()}`;
    }
  }

  if (current) {
    items.push(normalizeWhitespace(current));
  }

  return items
    .map((item) => normalizeWhitespace(item.replace(/[：:；;，,。.!?？]+$/g, '')))
    .filter((item) => item.length >= 8);
}

export function analyzeTurnRouting(text) {
  const normalizedText = String(text || '').trim();
  if (!normalizedText) {
    return {
      shouldSplit: false,
      workstreams: [],
      reason: '',
    };
  }

  const workstreams = extractAgendaItems(normalizedText).slice(0, 4);
  const hasStrongCue = isStrongMultiWorkstreamCue(normalizedText);
  if (workstreams.length < 2) {
    return {
      shouldSplit: false,
      workstreams,
      reason: '',
    };
  }

  const averageLength = workstreams.reduce((sum, item) => sum + item.length, 0) / workstreams.length;
  const shouldSplit = hasStrongCue || averageLength >= 14;

  return {
    shouldSplit,
    workstreams,
    reason: shouldSplit
      ? (hasStrongCue ? 'explicit_multi_agenda' : 'numbered_multi_agenda')
      : '',
  };
}

export function buildTurnRoutingHint(text) {
  const analysis = analyzeTurnRouting(text);
  if (!analysis.shouldSplit) return '';

  return [
    'High-priority routing hint for this turn:',
    `- The current user message contains ${analysis.workstreams.length} separable workstreams with independent outcomes.`,
    '- This routing decision outranks the convenience of answering everything inline in one thread.',
    '- Unless there is a strong reason not to, use the current session as a dispatcher/aggregation thread first.',
    '- Before doing substantive work inline, spawn one focused child session per workstream and keep each child scoped to a single topic.',
    '- Good split test: if a workstream could stand as its own session title or be completed by a different child session, split it.',
    '',
    'Detected workstreams:',
    ...analysis.workstreams.map((item, index) => `${index + 1}. ${item}`),
  ].join('\n');
}
