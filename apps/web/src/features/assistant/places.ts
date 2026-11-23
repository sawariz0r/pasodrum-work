// Names for the places an answer looked in and the targets it opens, from this browser's own store.
import { useNavigate } from 'react-router';
import { closeAssistant } from '../../app/rightPanel';
import { channelPath, dmPath } from '../../app/places';
import { useDmName } from '../../app/people/names';
import { useWorkspace, type Ref, type SearchHit } from '../../matrix';
import { useT } from './strings';

export interface Place {
  /** As the "Looked in" sentence names it: "#portal", "your conversation with 森 真由". */
  label: string;
  /** As a list row names it, beside its icon. */
  name: string;
  icon: 'hash' | 'chat' | null;
  open?: () => void;
}

/** Under 1000 px the panel covers the screen, so opening something there closes it; wider, the panel stays. */
const narrow = () => typeof matchMedia === 'function' && matchMedia('(max-width: 999px)').matches;

export function usePlaces() {
  const { t } = useT();
  const navigate = useNavigate();
  const channels = useWorkspace((s) => s.channels);
  const dms = useWorkspace((s) => s.dms);
  const spaces = useWorkspace((s) => s.spaces);
  const dmName = useDmName();

  const go = (path: string) => {
    if (narrow()) closeAssistant();
    navigate(path);
  };
  const pathOf = (room: string) => {
    const ch = Object.values(channels).flat().find((c) => c.id === room);
    if (ch) return channelPath(ch.spaceId, ch.id);
    return dms.some((d) => d.id === room) ? dmPath(room) : null;
  };

  const describe = (ref: Ref, plain?: string): Place | null => {
    if ('room' in ref) {
      const ch = Object.values(channels).flat().find((c) => c.id === ref.room);
      if (ch) return { label: t('chipChannel', { name: ch.name }), name: ch.name, icon: 'hash', open: () => go(channelPath(ch.spaceId, ch.id)) };
      const dm = dms.find((d) => d.id === ref.room);
      if (dm) {
        const name = dmName(dm);
        return { label: t('conversationWith', { name }), name, icon: 'chat', open: () => go(dmPath(dm.id)) };
      }
    }
    if (ref.k === 'space') {
      const name = spaces.find((x) => x.id === ref.space)?.name ?? plain;
      return name ? { label: name, name, icon: null } : null;
    }
    return plain ? { label: plain, name: plain, icon: null } : null;
  };

  /** A message opens in its conversation and flashes, as Search does; a reply opens its thread on top. */
  const openHit = ({ message, threadRootId }: SearchHit) => {
    const path = pathOf(message.channelId);
    if (path) go(`${path}?${new URLSearchParams(threadRootId ? { thread: threadRootId } : { msg: message.id })}`);
  };

  return { describe, openHit };
}
