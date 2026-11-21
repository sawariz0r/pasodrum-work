import type { SpaceKind } from './rules.ts';

export type Locale = 'en' | 'ja';
export type InviteEmail = {
  locale: Locale;
  inviter: string;
  spaceName: string;
  spaceId: string;
  spaceKind: SpaceKind;
  link: string;
  expiresTs: number;
  host: string;
};

export type ConfirmEmail = {
  locale: Locale;
  /** "Chrome on Mac"; null when the device has no name. */
  device: string | null;
  requestedTs: number;
  /** The requester's IANA zone; the time is shown in it. */
  tz: string | null;
  link: string;
  host: string;
};

const copy = {
  en: {
    subject: (who: string, space: string) => `${who} added you to ${space}`,
    join: (space: string) => `Join ${space}`,
    until: (date: string) => `Works once, until ${date}.`,
    date: new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' }),
  },
  ja: {
    subject: (who: string, space: string) => `${who} さんが ${space} にあなたを追加しました`,
    join: (space: string) => `${space} に参加`,
    until: (date: string) => `1 回だけ、${date}まで使えます。`,
    date: new Intl.DateTimeFormat('ja-JP', { month: 'long', day: 'numeric', timeZone: 'UTC' }),
  },
};

// Same palette and key as the app's rail tiles (ui/Avatar.tsx, shell/Rail.tsx).
const PALETTE = ['#C2410C', '#1D4ED8', '#7E22CE', '#0E7C66', '#B91C1C', '#A16207', '#0F766E', '#475569'];
export function tileColor(spaceId: string, kind: SpaceKind): string {
  if (kind === 'workspace') return '#0E7C66';
  let h = 0;
  for (const ch of spaceId) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const CJK = "'Hiragino Sans','Hiragino Kaku Gothic ProN','Yu Gothic UI',Meiryo,'Noto Sans JP'";
const BODY_FONT = `Inter,${CJK},-apple-system,'Segoe UI',Helvetica,Arial,sans-serif`;
const HEAD_FONT = `'Space Grotesk',${CJK},-apple-system,'Segoe UI',Helvetica,Arial,sans-serif`;

type Page = {
  locale: Locale;
  title: string;
  tile: { bg: string; fg: string; size: number; text: string };
  heading: string;
  line?: string;
  button: string;
  link: string;
  footer: string;
  host: string;
};

function page(p: Page): string {
  const bar = (h: number) =>
    `<td valign="bottom" style="padding:0 1px"><div style="width:3px;height:${h}px;border-radius:1.5px;background:#FFFFFF;font-size:0;line-height:0">&nbsp;</div></td>`;
  const line = p.line ? `\n<div style="margin-top:10px;font-size:15px;line-height:1.5;color:#55535C">${esc(p.line)}</div>` : '';
  return `<!doctype html>
<html lang="${p.locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(p.title)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&amp;family=Space+Grotesk:wght@500;700&amp;display=swap">
</head>
<body style="margin:0;padding:0;background:#F7F6F3">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F7F6F3">
<tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;font-family:${BODY_FONT};color:#1D1C22">
<tr><td style="padding:0 0 20px 4px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="26" height="26" align="center" valign="middle" style="width:26px;height:26px;border-radius:8px;background:#0E7C66">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto"><tr>${bar(5)}${bar(8)}${bar(11)}</tr></table>
</td>
<td style="padding-left:8px;font-family:${HEAD_FONT};font-size:16px;font-weight:700;color:#1D1C22">pasodrum <span style="font-weight:500;color:#6E6C76">work</span></td>
</tr></table>
</td></tr>
<tr><td style="padding:32px;border:1px solid #E8E6E1;border-radius:18px;background:#FFFFFF">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="52" height="52" align="center" valign="middle" style="width:52px;height:52px;border-radius:14px;background:${p.tile.bg};color:${p.tile.fg};font-family:${HEAD_FONT};font-size:${p.tile.size}px;font-weight:700;line-height:52px">${esc(p.tile.text)}</td>
</tr></table>
<h1 style="margin:20px 0 0;font-family:${HEAD_FONT};font-size:24px;font-weight:700;letter-spacing:-0.015em;line-height:1.3;color:#1D1C22">${esc(p.heading)}</h1>${line}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px"><tr>
<td align="center" style="border-radius:12px;background:#0E7C66"><a href="${esc(p.link)}" style="display:inline-block;padding:0 24px;line-height:48px;border-radius:12px;color:#FFFFFF;font-family:${BODY_FONT};font-size:15.5px;font-weight:600;text-decoration:none">${esc(p.button)}</a></td>
</tr></table>
</td></tr>
<tr><td style="padding:16px 4px 0;font-size:12.5px;line-height:1.6;color:#6E6C76">${esc(p.footer)}<br>${esc(p.host)}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`;
}

export function renderInvite(e: InviteEmail): { subject: string; html: string; text: string } {
  const t = copy[e.locale];
  const subject = t.subject(e.inviter, e.spaceName);
  const join = t.join(e.spaceName);
  const until = t.until(t.date.format(e.expiresTs));
  const initial = (Array.from(e.spaceName.trim())[0] ?? '?').toUpperCase();
  const html = page({
    locale: e.locale,
    title: subject,
    tile: { bg: tileColor(e.spaceId, e.spaceKind), fg: '#FFFFFF', size: 22, text: initial },
    heading: subject,
    button: join,
    link: e.link,
    footer: until,
    host: e.host,
  });
  const text = `${subject}\n\n${join}:\n${e.link}\n\n${until}\n${e.host}\n`;
  return { subject, html, text };
}

const confirmCopy = {
  en: {
    subject: (device: string | null) => (device ? `Confirm it’s you on ${device}` : 'Confirm it’s you'),
    heading: 'Confirm it’s you',
    when: (time: string, city: string | null) => `today ${time}${city ? `, ${city}` : ''}`,
    button: 'Confirm it’s me',
    footer: 'Works once, for 15 minutes. Wasn’t you? Ignore this email and change your password.',
  },
  ja: {
    subject: (device: string | null) => (device ? `${device} でのご本人確認` : 'ご本人の確認'),
    heading: 'ご本人の確認',
    when: (time: string, city: string | null) => `今日 ${time}${city ? `・${city}` : ''}`,
    button: '本人であることを確認',
    footer: '1 回だけ、15 分間使えます。心当たりがない場合は、このメールを無視してパスワードを変更してください。',
  },
};

const CITY_JA: Record<string, string> = { 'Asia/Tokyo': '東京' };

export function validZone(tz: unknown): string | null {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return null;
  try {
    return new Intl.DateTimeFormat('en', { timeZone: tz }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

/** "14:05" in the zone (UTC when it has none). */
export function clock(ts: number, tz: string | null): string {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: tz ?? 'UTC' }).format(ts);
}

function cityOf(tz: string | null, locale: Locale): string | null {
  if (!tz || !tz.includes('/')) return null;
  return (locale === 'ja' && CITY_JA[tz]) || tz.slice(tz.lastIndexOf('/') + 1).replaceAll('_', ' ');
}

export function renderConfirm(e: ConfirmEmail): { subject: string; html: string; text: string } {
  const t = confirmCopy[e.locale];
  const subject = t.subject(e.device);
  const when = t.when(clock(e.requestedTs, e.tz), cityOf(e.tz, e.locale));
  const line = e.device ? `${e.device} · ${when}` : when.charAt(0).toUpperCase() + when.slice(1);
  const html = page({
    locale: e.locale,
    title: subject,
    tile: { bg: '#E2F2EC', fg: '#0E7C66', size: 26, text: '✓' },
    heading: t.heading,
    line,
    button: t.button,
    link: e.link,
    footer: t.footer,
    host: e.host,
  });
  const text = `${t.heading}\n${line}\n\n${t.button}:\n${e.link}\n\n${t.footer}\n${e.host}\n`;
  return { subject, html, text };
}
