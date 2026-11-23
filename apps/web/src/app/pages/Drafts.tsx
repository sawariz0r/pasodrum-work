// Drafts (Batch C Drafts / DraftsEmpty): unsent drafts on this device (D-16), newest first.
// A row opens the conversation with the draft in its composer; Delete fades the row out, then removes it.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useWorkspace, type Space, type WorkspaceSnapshot } from '../../matrix';
import { IconButton, isImeEnter } from '../../ui';
import { clearDraft, useDrafts, type StoredDraft } from '../drafts';
import { HashIcon, LockIcon } from '../icons';
import { DmFace, Face, others } from '../people/Face';
import { useDmName } from '../people/names';
import { channelPath, spaceDmPath, threadPath } from '../places';
import { DrawerToggle } from '../shell/Drawer';
import { HeaderEnd } from '../shell/HeaderEnd';
import { SendIcon, ThreadIcon, TrashIcon } from '../shell/icons';
import { useSpaceDrafts } from '../shell/spaceRooms';
import { useListTime } from './lists';
import s from './Pages.module.css';

const LEAVE_MS = 180; // --dur-2

const keyOf = (d: StoredDraft) => `${d.channelId}|${d.threadRootId ?? ''}`;

export function DraftsView({ space }: { space: Space }) {
  const { t } = useTranslation();
  const drafts = useSpaceDrafts(space.id, useDrafts());
  const [leaving, setLeaving] = useState<string[]>([]);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), []);

  const remove = (d: StoredDraft) => {
    setLeaving((list) => [...list, keyOf(d)]);
    timers.current.push(window.setTimeout(() => clearDraft(d.channelId, d.threadRootId), LEAVE_MS));
  };

  return (
    <div className={s.page}>
      <header className={s.pageHeader}>
        <DrawerToggle />
        <SendIcon size={18} strokeWidth={2.1} />
        <h1 className={s.pageTitle}>{t('shell.sidebar.drafts')}</h1>
        <HeaderEnd />
      </header>
      <div className={s.pageBody}>
        {drafts.length === 0 ? (
          <div className={s.pageEmpty}>
            <div className={s.pageEmptyIcon}>
              <SendIcon size={30} strokeWidth={1.8} />
            </div>
            <h2 className={s.emptyTitle}>{t('pages.drafts.empty')}</h2>
          </div>
        ) : (
          drafts.map((d) => <Row key={keyOf(d)} draft={d} spaceId={space.id} leaving={leaving.includes(keyOf(d))} onDelete={() => remove(d)} />)
        )}
      </div>
    </div>
  );
}

function placeOf(x: WorkspaceSnapshot, roomId: string) {
  for (const list of Object.values(x.channels)) {
    const c = list.find((ch) => ch.id === roomId);
    if (c) return c;
  }
  return x.dms.find((d) => d.id === roomId);
}

function Row({ draft, spaceId, leaving, onDelete }: { draft: StoredDraft; spaceId: string; leaving: boolean; onDelete: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const time = useListTime();
  const dmName = useDmName();
  const meId = useWorkspace((x) => x.me.id);
  const place = useWorkspace((x) => placeOf(x, draft.channelId));
  if (!place) return null;
  const dm = 'people' in place ? place : undefined;
  const channel = 'private' in place ? place : undefined;

  const to = dm
    ? spaceDmPath(spaceId, dm.id)
    : draft.threadRootId
      ? threadPath(spaceId, draft.channelId, draft.threadRootId)
      : channelPath(spaceId, draft.channelId);
  const open = () => navigate(to);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (isImeEnter(e) || e.key === ' ') {
      e.preventDefault();
      open();
    }
  };

  return (
    <div role="link" tabIndex={0} className={[s.draft, leaving && s.leaving].filter(Boolean).join(' ')} onClick={open} onKeyDown={onKeyDown}>
      {dm && others(dm, meId).length === 1 ? (
        <Face person={others(dm, meId)[0]!} size={34} />
      ) : dm ? (
        <DmFace dm={dm} meId={meId} />
      ) : (
        <span className={s.tile}>
          {draft.threadRootId ? <ThreadIcon strokeWidth={2} /> : channel?.private ? <LockIcon /> : <HashIcon />}
        </span>
      )}
      <div className={s.rowMain}>
        <div className={s.draftTop}>
          <span className={s.draftDest}>{dm ? dmName(dm) : t('common.channelName', { name: channel!.name })}</span>
          <span className={s.time}>{time(draft.updatedTs)}</span>
        </div>
        <div className={`${s.draftText} ${s.clamp2}`}>{draft.body}</div>
      </div>
      <div className={s.tools}>
        <IconButton
          size={30}
          className={s.toolButton}
          label={t('pages.drafts.delete')}
          icon={<TrashIcon />}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        />
      </div>
    </div>
  );
}
