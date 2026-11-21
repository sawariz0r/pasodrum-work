// "This leaves the company" (RulesM5): one amber mark wherever someone outside the workspace reads along.
// Team people only: Channel.outside is empty for clients and guests, and they never see the corner on DMs.
import { useTranslation } from 'react-i18next';
import { useWorkspace, type Person } from '../../matrix';
import { ExternalIcon } from '../icons';
import { Face, others } from '../people/Face';
import { useShowExternal } from '../people/names';
import s from './Channels.module.css';
import { findChannel } from './shared';

const none: Person[] = [];

/** The outside people in a channel or DM, as the signed-in team person sees them. */
export function useOutside(channelId: string): Person[] {
  const showExternal = useShowExternal();
  const meId = useWorkspace((x) => x.me.id);
  const channel = useWorkspace((x) => findChannel(x, channelId));
  const dm = useWorkspace((x) => (channel ? undefined : x.dms.find((d) => d.id === channelId)));
  if (!showExternal) return none;
  if (channel) return channel.outside ?? none;
  return dm ? others(dm, meId).filter((p) => p.external) : none;
}

export function useOutsideLabel(people: Person[]): string {
  const { t } = useTranslation();
  return t('spaces.outside', { names: people.map((p) => p.name).join(t('people.nameSeparator')) });
}

function Mark({ small }: { small?: boolean }) {
  return (
    <span className={[s.outsideMark, small && s.outsideSmall].filter(Boolean).join(' ')} aria-hidden="true">
      <ExternalIcon size={small ? 9 : 10} />
    </span>
  );
}

/** After a channel or DM name. Clicking opens Members where there are members to show. */
export function OutsideHeaderMark({ people, onClick }: { people: Person[]; onClick?: () => void }) {
  const label = useOutsideLabel(people);
  if (!people.length) return null;
  if (!onClick) {
    return (
      <span role="img" className={s.outsideHead} aria-label={label} title={label}>
        <Mark />
      </span>
    );
  }
  return (
    <button type="button" className={`${s.outsideHead} ${s.outsideButton}`} aria-label={label} title={label} onClick={onClick}>
      <Mark />
    </button>
  );
}

/** Beside Send, with the outside people's faces: in view at the moment of sending. */
export function OutsideComposerMark({ people, onClick }: { people: Person[]; onClick?: () => void }) {
  const label = useOutsideLabel(people);
  if (!people.length) return null;
  const faces = (
    <>
      <Mark />
      <span className={s.outsideFaces}>
        {people.slice(0, 3).map((p) => (
          <Face key={p.id} person={p} size={20} className={s.outsideFace} />
        ))}
      </span>
    </>
  );
  return onClick ? (
    <button type="button" className={s.outsideComposer} aria-label={label} title={label} onClick={onClick}>
      {faces}
    </button>
  ) : (
    <span role="img" className={s.outsideComposer} aria-label={label} title={label}>
      {faces}
    </span>
  );
}

/** At the end of a sidebar row: workspace channels with outside people. */
export function OutsideRowMark({ people }: { people: Person[] }) {
  const label = useOutsideLabel(people);
  return (
    <span role="img" className={s.outsideRow} aria-label={label} title={label}>
      <Mark small />
    </span>
  );
}
