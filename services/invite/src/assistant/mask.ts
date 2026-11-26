// What is removed from text and names before the model sees them (spec §3.4). One function for message text, display
// names, place names and titles alike.

// Message text is untrusted and up to 64 KB, so every pattern runs in linear time: a pattern that opens with a repeated
// class starts only where a run of that class starts (the lookbehind), so no run is scanned again from each of its
// characters.
const FENCE = /```[\s\S]*?(?:```|$)/g;
const URL = /(?:(?<![a-z0-9+.-])[a-z0-9+.-]+:\/\/|\b(?:www\.|mailto:|matrix:))[^\s<>"'）」]+/gi;
const BARE_URL = /(?<![a-z0-9.-])[a-z0-9.-]*[a-z0-9-]\.[a-z]{2,}\/[^\s<>"'）」]*/gi;
const MATRIX_ID = /[@!#$][\w.=/+-]+:(?:(?:[a-z0-9-]+\.)+[a-z0-9-]+|localhost)(?::\d+)?/gi;
const OPAQUE_ID = /[!$][\w+/=-]{16,}/g;
const EMAIL = /(?<![\w.%+-])[\w.%+-]+@(?:[a-z0-9-]+\.)+[a-z]{2,}/gi;
const TRAILING = /(?<![.,;:!?)\]])[.,;:!?)\]]+$/;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// A link's trailing punctuation belongs to the sentence.
const link = (m: string) => `[link]${TRAILING.exec(m)?.[0] ?? ''}`;

// Everything an address, ID, server name or link start is made of; a cut between two of these could split one.
const TOKEN = /[\w.%+\-@:!#$=/]/;
const BACK = 512;

/** Enough of `text` for `max` masked characters, cut where no address or ID can be split unless it sits in a longer run. */
function head(text: string, max: number): string {
  const cut = max * 2;
  if (text.length <= cut) return text;
  for (let i = cut; i > cut - BACK; i--) if (!TOKEN.test(text[i - 1]!) || !TOKEN.test(text[i]!)) return text.slice(0, i);
  return text.slice(0, cut);
}

export function masker(serverName: string) {
  const server = new RegExp(escape(serverName), 'gi');
  const run = (text: string): string =>
    text
      .replace(FENCE, '[code]')
      .replace(URL, link)
      .replace(BARE_URL, link)
      .replace(MATRIX_ID, '')
      .replace(OPAQUE_ID, '')
      .replace(EMAIL, '[email]')
      .replace(server, '')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .trim();
  /** With `max`, at most `max` characters, masked from the start of the text only. */
  return (text: string, max?: number): string => (max === undefined ? run(text) : run(head(text, max)).slice(0, max));
}

export type Mask = ReturnType<typeof masker>;
