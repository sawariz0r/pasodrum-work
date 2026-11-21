// Hover bar (Thread · React · Reply · More, MsgHoverM3) and the More menu. The bar is right-anchored; Thread is left out inside a thread.
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore, type Message } from '../../matrix';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../../ui';
import { useComposer } from '../composer/context';
import { CopyIcon, EditIcon, LinkIcon, MoreIcon, ReplyIcon, SmileIcon, TrashIcon } from '../icons';
import { ThreadIcon } from '../thread/icons';
import { useArchivedSpace } from './ArchivedBar';
import { useTimeline } from './context';
import { ReactionPicker } from './ReactionPicker';
import s from './Timeline.module.css';

const editable = (m: Message) => !m.kind || m.kind === 'text' || m.kind === 'emote' || m.kind === 'notice';

function copy(text: string) {
  return navigator.clipboard?.writeText(text) ?? Promise.reject(new Error('no clipboard'));
}

export function MessageActions({
  message: m,
  group,
  own,
  onOpenChange,
}: {
  message: Message;
  group?: Message[];
  own: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const store = useStore();
  const composer = useComposer();
  const tl = useTimeline();
  // Archived client space: read-only, so only the actions that don't write stay (thread, copy).
  const writable = !useArchivedSpace(tl.channelId);
  // The bar goes away while editing; a menu closed by unmounting never reports it.
  useEffect(() => () => onOpenChange(false), [onOpenChange]);
  const react = (key: string) => {
    if (!m.reactions?.some((r) => r.key === key && r.mine)) store.react(tl.channelId, m.id, key);
  };

  return (
    <div className={s.actions}>
      {tl.openThread && (
        <button type="button" className={s.tool} aria-label={t('timeline.replyInThread')} onClick={() => tl.openThread?.(m.id)}>
          <ThreadIcon />
        </button>
      )}
      {writable && (
        <>
          <ReactionPicker onPick={react} onOpenChange={onOpenChange}>
            <button type="button" className={s.tool} aria-label={t('timeline.addReaction')}>
              <SmileIcon />
            </button>
          </ReactionPicker>
          <button type="button" className={s.tool} aria-label={t('timeline.reply')} onClick={() => composer.startReply(m.id)}>
            <ReplyIcon />
          </button>
        </>
      )}
      <Menu modal={false} onOpenChange={onOpenChange}>
        <MenuTrigger asChild>
          <button type="button" className={s.tool} aria-label={t('timeline.more')}>
            <MoreIcon />
          </button>
        </MenuTrigger>
        <MenuContent side="top" align="end" sideOffset={8} alignOffset={-4} width={224} className={s.menu}>
          {writable && own && editable(m) && (
            <MenuItem icon={<EditIcon />} onSelect={() => composer.startEdit(m.id)}>
              {t('timeline.edit')}
            </MenuItem>
          )}
          {m.body && (
            <MenuItem icon={<CopyIcon />} onSelect={() => void copy(m.body).catch(() => {})}>
              {t('timeline.copyText')}
            </MenuItem>
          )}
          <MenuItem
            icon={<LinkIcon />}
            onSelect={() => void copy(store.messageLink(tl.channelId, m.id)).then(tl.linkCopied, () => {})}
          >
            {t('timeline.copyLink')}
          </MenuItem>
          {writable && own && (
            <>
              <MenuSeparator className={s.menuSep} />
              <MenuItem icon={<TrashIcon />} className={s.danger} onSelect={() => tl.askDelete(group ?? [m])}>
                {t('timeline.delete')}
              </MenuItem>
            </>
          )}
        </MenuContent>
      </Menu>
    </div>
  );
}
