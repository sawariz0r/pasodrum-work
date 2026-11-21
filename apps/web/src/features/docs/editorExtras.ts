import type { AnyExtension } from '@tiptap/react';
import type { PageSession, Person } from '../../matrix';
import { carets } from './Carets';

/** Extensions added after the block set: other people's carets (DB-04). */
export function editorExtras(session: PageSession, me: Person): AnyExtension[] {
  return carets(session, me);
}
