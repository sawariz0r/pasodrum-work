// What is removed from text and names before the model sees them (spec §3.4). One function for message text, display
// names, place names and titles alike.

const FENCE = /```[\s\S]*?(?:```|$)/g;
const URL = /\b(?:[a-z][a-z0-9+.-]*:\/\/|www\.|mailto:|matrix:)[^\s<>"'）」]+/gi;
const BARE_URL = /\b(?:[a-z0-9-]+\.)+[a-z]{2,}\/[^\s<>"'）」]*/gi;
const MATRIX_ID = /[@!#$][\w.=/+-]+:(?:(?:[a-z0-9-]+\.)+[a-z0-9-]+|localhost)(?::\d+)?/gi;
const OPAQUE_ID = /[!$][\w+/=-]{16,}/g;
const EMAIL = /[\w.%+-]+@(?:[a-z0-9-]+\.)+[a-z]{2,}/gi;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// A link's trailing punctuation belongs to the sentence.
const link = (m: string) => `[link]${/[.,;:!?)\]]+$/.exec(m)?.[0] ?? ''}`;

export function masker(serverName: string) {
  const server = new RegExp(escape(serverName), 'gi');
  return (text: string): string =>
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
}

export type Mask = ReturnType<typeof masker>;
