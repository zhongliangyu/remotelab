import { BASIC_CHAT_APP_ID, WELCOME_APP_ID, getApp } from './apps.mjs';
import { appendEvents } from './history.mjs';
import { messageEvent } from './normalizer.mjs';
import {
  applyAppTemplateToSession,
  createSession,
  getSession,
  listSessions,
  setSessionPinned,
  updateSessionGrouping,
  updateSessionLastReviewedAt,
} from './session-manager.mjs';

export const OWNER_BOOTSTRAP_WELCOME_SESSION_EXTERNAL_TRIGGER_ID = 'owner_bootstrap:welcome';

const LEGACY_WELCOME_SHOWCASE_HINT = [
  '另外，左侧已经给你放了 3 个示例会话。',
  '你可以按兴趣点开看看，主要是参考：用户通常怎么开头、我会怎么追问，以及最后能交付什么。',
  '觉得哪个最像你的情况，就直接照着那个方式把你的版本发给我。',
].join('\n\n');

const OWNER_BOOTSTRAP_SESSIONS = Object.freeze([
  Object.freeze({
    appId: WELCOME_APP_ID,
    externalTriggerId: OWNER_BOOTSTRAP_WELCOME_SESSION_EXTERNAL_TRIGGER_ID,
    name: 'Welcome',
    pinned: true,
    sidebarOrder: 1,
  }),
  Object.freeze({
    appId: BASIC_CHAT_APP_ID,
    externalTriggerId: 'owner_bootstrap:showcase:news_digest',
    name: '[示例] 每天早上把 AI 行业新闻整理后发到我邮箱',
    pinned: true,
    sidebarOrder: 2,
    messages: [
      {
        role: 'user',
        content: '我想每天早上 8 点收到一封 AI 行业新闻简报，重点看模型公司、融资、产品发布和政策变化，控制在 5 条以内。',
      },
      {
        role: 'assistant',
        content: [
          '好，我先确认两件事：',
          '1）重点关注中文、英文还是都要？',
          '2）简报发到哪个邮箱，标题想固定成什么格式？',
        ].join('\n'),
      },
      {
        role: 'user',
        content: '中英文都可以，但优先英文一手信息。发到 `me@example.com`，标题就叫 `AI 情报晨报｜YYYY-MM-DD`。',
      },
      {
        role: 'assistant',
        content: [
          '收到。我先跑一版今天的样例，再把它设成每天 8 点发送。',
          '刚刚我已抓取近 24 小时公开信息源，去重后整理成 5 条以内摘要，并按“发生了什么 / 为什么值得看 / 原文链接”生成邮件。',
          '结果物是：一封已发送到你邮箱的简报，以及一个每天自动执行的发送流程。',
          '如果你要，我现在就可以把这个示例改成你的版本，比如只盯机器人、出海 SaaS，或者只看某几家公司。',
        ].join('\n\n'),
      },
    ],
  }),
  Object.freeze({
    appId: BASIC_CHAT_APP_ID,
    externalTriggerId: 'owner_bootstrap:showcase:excel_cleanup',
    name: '[示例] 把这份 Excel 清洗后回给我',
    pinned: true,
    sidebarOrder: 3,
    messages: [
      {
        role: 'user',
        content: '我上传了一份销售 Excel，里面日期格式很乱，联系人和电话混在一起，还有一些重复客户。你帮我清洗一下，再回我一个能直接导入 CRM 的版本。',
      },
      {
        role: 'assistant',
        content: [
          '我先确认两件事：',
          '1）你想用哪一列作为唯一客户标识去重？',
          '2）省市信息是按现有地址推断，还是只保留能明确识别的行？',
        ].join('\n'),
      },
      {
        role: 'user',
        content: '手机号是唯一标识。省市按地址推断，不确定的留空并标记出来。',
      },
      {
        role: 'assistant',
        content: [
          '明白。我已经读取你上传的 `sales-march.xlsx`，标准化了日期格式，拆分了联系人与手机号，按手机号合并重复客户，并新增 `省`、`市`、`需人工确认` 三列。',
          '结果物是：清洗后的 `sales-march.cleaned.xlsx`，以及一页 `清洗说明`，告诉你哪些记录还需要人工补一眼。',
          '把你自己的表直接发给我，我会按同样流程先跑一次；如果结果稳定，再顺手把它固化成以后重复可用的流程。',
        ].join('\n\n'),
      },
    ],
  }),
  Object.freeze({
    appId: BASIC_CHAT_APP_ID,
    externalTriggerId: 'owner_bootstrap:showcase:expense_email',
    name: '[示例] 收到报销邮件后自动提取附件并汇总',
    pinned: true,
    sidebarOrder: 4,
    messages: [
      {
        role: 'user',
        content: '我想把收到的报销邮件自动处理掉。凡是主题里有“报销”或 `invoice` 的邮件，都把附件下载出来，提取金额、日期、申请人，汇总成一个表。',
      },
      {
        role: 'assistant',
        content: [
          '我先确认两件事：',
          '1）你用哪个邮箱接收，这类邮件有没有固定发件域名？',
          '2）汇总表是每来一封就追加，还是每周给你一份总表？',
        ].join('\n'),
      },
      {
        role: 'user',
        content: '用 `finance@example.com`，发件人不固定，但大多数都会带 PDF 或图片附件。先持续追加，周一早上再给我一份汇总。',
      },
      {
        role: 'assistant',
        content: [
          '收到。我会在匹配邮件到达时自动新开处理线程：下载附件、OCR 或解析、提取金额/日期/申请人/类别，然后追加到 `expense-intake.xlsx`。',
          '识别不确定的项会标成 `待确认`，并保留原邮件链接。',
          '结果物是：一份持续更新的汇总表、归档好的附件，以及每周一早上发给你的汇总邮件。',
          '你给我一封真实样例邮件后，我就可以把这个示例直接换成你的版本，让它开始替你接活。',
        ].join('\n\n'),
      },
    ],
  }),
]);

function buildMessageEvents(messages = []) {
  return messages
    .filter((message) => message && typeof message.content === 'string' && message.content.trim())
    .map((message) => messageEvent(message.role === 'user' ? 'user' : 'assistant', message.content));
}

async function createOwnerBootstrapSession(definition, { appendLegacyWelcomeHint = false } = {}) {
  const app = await getApp(definition.appId);
  if (!app?.id) return null;

  let session = await createSession('~', app.tool || 'codex', definition.name || app.name || 'Session', {
    appId: app.id,
    appName: app.name || '',
    sourceId: 'chat',
    sourceName: 'Chat',
    externalTriggerId: definition.externalTriggerId,
  });
  session = await applyAppTemplateToSession(session.id, app.id) || session;
  session = await getSession(session.id) || session;

  if (Number(session?.messageCount || 0) === 0) {
    const starterMessages = Array.isArray(definition.messages) && definition.messages.length > 0
      ? definition.messages
      : (app.welcomeMessage ? [{ role: 'assistant', content: app.welcomeMessage }] : []);
    const starterEvents = buildMessageEvents(starterMessages);
    if (starterEvents.length > 0) {
      await appendEvents(session.id, starterEvents);
      session = await getSession(session.id) || session;
    }
  } else if (appendLegacyWelcomeHint && definition.externalTriggerId === OWNER_BOOTSTRAP_WELCOME_SESSION_EXTERNAL_TRIGGER_ID) {
    await appendEvents(session.id, [messageEvent('assistant', LEGACY_WELCOME_SHOWCASE_HINT)]);
    session = await getSession(session.id) || session;
  }

  if (Number.isInteger(definition.sidebarOrder) && definition.sidebarOrder > 0) {
    session = await updateSessionGrouping(session.id, { sidebarOrder: definition.sidebarOrder }) || session;
  }
  if (definition.pinned === true) {
    session = await setSessionPinned(session.id, true) || session;
  }
  if (session?.updatedAt) {
    session = await updateSessionLastReviewedAt(session.id, session.updatedAt) || session;
  }

  return session;
}

export async function ensureOwnerBootstrapSessions() {
  const ownerSessions = (await listSessions({
    includeVisitor: true,
    includeArchived: true,
  })).filter((session) => !session?.visitorId);

  const activeOwnerSessions = ownerSessions.filter((session) => session?.archived !== true);
  const hasLegacyBlankWelcomeOnly = activeOwnerSessions.length === 1
    && activeOwnerSessions[0]?.externalTriggerId === OWNER_BOOTSTRAP_WELCOME_SESSION_EXTERNAL_TRIGGER_ID
    && Number(activeOwnerSessions[0]?.messageCount || 0) <= 1;

  if (activeOwnerSessions.length > 0 && !hasLegacyBlankWelcomeOnly) {
    return activeOwnerSessions[0];
  }

  let welcomeSession = null;
  for (const definition of OWNER_BOOTSTRAP_SESSIONS) {
    const session = await createOwnerBootstrapSession(definition, {
      appendLegacyWelcomeHint: hasLegacyBlankWelcomeOnly,
    });
    if (definition.externalTriggerId === OWNER_BOOTSTRAP_WELCOME_SESSION_EXTERNAL_TRIGGER_ID) {
      welcomeSession = session;
    }
  }

  return welcomeSession || activeOwnerSessions[0] || null;
}
