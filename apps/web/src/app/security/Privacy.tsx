// SIDE-02 (D-34): encrypted conversations say who can read them, in plain words. Unencrypted ones say nothing.
import { useTranslation } from 'react-i18next';
import { useWorkspace, type Channel, type Dm } from '../../matrix';
import { LockIcon } from '../icons';
import { others } from '../people/Face';
import s from './Security.module.css';

/** "Only you and Henrik can read this conversation." (1:1 DM, first name) or "Only the people here …"; undefined when not encrypted. */
export function usePrivacyText(place: Channel | Dm | undefined): string | undefined {
  const { t } = useTranslation();
  const meId = useWorkspace((x) => x.me.id);
  if (!place?.encrypted) return undefined;
  const people = 'people' in place ? others(place, meId) : [];
  const single = people.length === 1 && people[0]!.id !== meId ? people[0]! : undefined;
  return single ? t('security.privacyOne', { name: single.name.split(' ')[0] }) : t('security.privacyMany');
}

/** At the conversation start, under the name. */
export function PrivacyLine({ text }: { text: string }) {
  return (
    <div className={s.privacyLine}>
      <LockIcon size={15} strokeWidth={2} />
      <span>{text}</span>
    </div>
  );
}

/** After the name in a DM header; the same sentence on hover and focus (PrivateDMTooltip). */
export function PrivacyLock({ text, gap }: { text: string; gap?: boolean }) {
  return (
    <button type="button" className={[s.privacyLock, gap && s.privacyLockGap].filter(Boolean).join(' ')} aria-label={text}>
      <LockIcon size={15} strokeWidth={2.1} />
      <span className={s.privacyTip} aria-hidden="true">
        {text}
      </span>
    </button>
  );
}
