// Invite service (D-07, D-26). Run: node src/index.ts
import { createServer } from 'node:http';
import { createApp } from './app.ts';
import { mailer } from './mail.ts';
import { matrixClient } from './matrix.ts';
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
const app = createApp({
  cfg: {
    serverName,
    publicUrl: env('PUBLIC_URL', `https://${serverName}`).replace(/\/+$/, ''),
    registrationToken: env('REGISTRATION_TOKEN'),
    workspaceAlias: env('WORKSPACE_ALIAS', `#workspace:${serverName}`),
    translate,
    translateDailyLimit: Number.isFinite(dailyLimit) ? dailyLimit : 0,
  },
  store: openStore(env('DB_PATH', '/data/invites.db')),
  mx: matrixClient(env('MATRIX_URL', 'http://continuwuity:6167')),
  sendMail: mailer({
    from: env('MAIL_FROM', 'Pasodrum work <invites@noreply.prpl.se>'),
    resendKey: process.env.RESEND_API_KEY || undefined,
    mailpitUrl: env('MAILPIT_URL', 'http://mailpit:8025'),
  }),
  key: keyFrom(env('INVITE_SECRET')),
  confirmKey: keyFrom(env('CONFIRM_KEY_SECRET'), 'pasodrum-confirm-keys/v1', 'CONFIRM_KEY_SECRET'),
  systemPassword: process.env.SYSTEM_PASSWORD || undefined,
});

const port = Number(env('PORT', '8080'));
const server = createServer(app).listen(port, () => {
  console.log(`invite service on :${port} (${serverName}, mail via ${process.env.RESEND_API_KEY ? 'Resend' : 'Mailpit'}, translate ${translate ? `on, ${dailyLimit}/day` : 'off'})`);
});
for (const sig of ['SIGTERM', 'SIGINT'] as const) process.on(sig, () => server.close(() => process.exit(0)));
