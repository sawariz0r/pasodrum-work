// Invite service (D-07, D-26). Run: node src/index.ts
import { createServer } from 'node:http';
import { createApp } from './app.ts';
import { mailer } from './mail.ts';
import { homeserverGet, matrixClient } from './matrix.ts';
import { keyFrom } from './secret.ts';
import { openStore } from './store.ts';

function env(name: string, fallback?: string): string {
  const v = process.env[name] || fallback;
  if (!v) {
    console.error(`${name} is not set`);
    process.exit(1);
  }
  return v;
}

const serverName = env('SERVER_NAME');
const { OPENAI_API_KEY, TRANSLATE_MODEL } = process.env;
const translate = OPENAI_API_KEY ? { apiKey: OPENAI_API_KEY, model: TRANSLATE_MODEL || 'gpt-6-luna' } : null;
const dailyLimit = Number(env('TRANSLATE_DAILY_LIMIT', '2000'));
const matrixUrl = env('MATRIX_URL', 'http://continuwuity:6167');
const workspaceAlias = env('WORKSPACE_ALIAS', `#workspace:${serverName}`);

// Spec §2.5, §6.2: prices in US dollars per million tokens, keyed by model id.
const DEFAULT_PRICES = '{"gpt-6.2-sol":{"in":2,"cached":0.1,"write":2.5,"out":10},"gpt-6.2-astra":{"in":8,"cached":0.4,"write":10,"out":40}}';
function assistantConfig() {
  const apiKey = process.env.ASSISTANT_OPENAI_API_KEY;
  if (!apiKey) return null;
  let prices: unknown;
  try {
    prices = JSON.parse(process.env.ASSISTANT_PRICES || DEFAULT_PRICES);
  } catch {
    console.error('ASSISTANT_PRICES is not JSON; the Assistant is off');
    return null;
  }
  const usd = (name: string, fallback: number) => {
    const n = Number(process.env[name] || fallback);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  return {
    apiKey,
    quick: process.env.ASSISTANT_QUICK || 'gpt-6.2-sol:low',
    thorough: process.env.ASSISTANT_THOROUGH || 'gpt-6.2-astra:medium',
    prices: prices as Record<string, { in: number; cached: number; write: number; out: number }>,
    dayUsd: usd('ASSISTANT_DAY_USD', 3),
    monthUsd: usd('ASSISTANT_MONTH_USD', 100),
    dbPath: process.env.ASSISTANT_DB_PATH || '/data/assistant.db',
    workspaceAlias,
    serverName,
  };
}
const assistant = assistantConfig();
const resendKey = process.env.RESEND_API_KEY || undefined;
const mailpitUrl = process.env.MAILPIT_URL || undefined;
if (!resendKey && !mailpitUrl) console.error('MAIL IS OFF: RESEND_API_KEY is not set. Invites are created but no email is sent.');
const app = createApp({
  cfg: {
    serverName,
    publicUrl: env('PUBLIC_URL', `https://${serverName}`).replace(/\/+$/, ''),
    registrationToken: env('REGISTRATION_TOKEN'),
    workspaceAlias,
    translate,
    translateDailyLimit: Number.isFinite(dailyLimit) ? dailyLimit : 0,
  },
  store: openStore(env('DB_PATH', '/data/invites.db')),
  mx: matrixClient(matrixUrl),
  assistant: { get: homeserverGet(matrixUrl), config: assistant },
  sendMail: mailer({
    from: env('MAIL_FROM', 'Pasodrum work <invites@noreply.prpl.se>'),
    resendKey,
    mailpitUrl,
  }),
  key: keyFrom(env('INVITE_SECRET')),
  confirmKey: keyFrom(env('CONFIRM_KEY_SECRET'), 'pasodrum-confirm-keys/v1', 'CONFIRM_KEY_SECRET'),
  systemPassword: process.env.SYSTEM_PASSWORD || undefined,
});

const port = Number(env('PORT', '8080'));
const server = createServer(app).listen(port, () => {
  console.log(`invite service on :${port} (${serverName}, mail via ${resendKey ? 'Resend' : mailpitUrl ? 'Mailpit' : 'NOTHING'}, translate ${translate ? `on, ${dailyLimit}/day` : 'off'}, assistant ${assistant ? 'on' : 'off'})`);
});
server.on('upgrade', (req, socket, head) => {
  if (!app.upgrade(req, socket, head)) socket.destroy();
});
for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
    app.closeSockets();
  });
}
