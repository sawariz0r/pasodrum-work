// New channel (CreateChannel, CreateChannelSpace, CreateChannelTaken): which space, name, private.
// The name's # turns into the lock when Private is on. Privacy is fixed after creation.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useStore, useWorkspace } from '../../matrix';
import { Button, Dialog, isImeEnter, Menu, MenuContent, MenuItem, MenuTrigger } from '../../ui';
import { HashIcon, LockIcon } from '../icons';
import { channelPath } from '../places';
import s from './Channels.module.css';
import { AlertIcon, CheckIcon, ChevronIcon } from './icons';
import { canCreateIn, channelSlug } from './roles';
import { SpaceMark } from './shared';

export function CreateChannelDialog({ open, spaceId: initial, onClose }: { open: boolean; spaceId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const store = useStore();
  const navigate = useNavigate();
  const allSpaces = useWorkspace((x) => x.spaces);
  const roles = useWorkspace((x) => x.myRoles);
  const spaces = allSpaces.filter((sp) => canCreateIn(roles[sp.id]));
  const [spaceId, setSpaceId] = useState(() => (spaces.some((sp) => sp.id === initial) ? initial : (spaces[0]?.id ?? initial)));
  const [name, setName] = useState('');
  const [isPrivate, setPrivate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [known, setKnown] = useState<string[]>([]);
  const [rejected, setRejected] = useState<string[]>([]);
  const [failed, setFailed] = useState<string | null>(null);
  const joined = useWorkspace((x) => x.channels[spaceId]);
  const space = spaces.find((sp) => sp.id === spaceId);

  // Names in use: joined channels at once, then every channel the space lists.
  useEffect(() => {
    let live = true;
    store.browseChannels(spaceId).then(
      (list) => live && setKnown(list.map((c) => c.name)),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [store, spaceId]);

  const clean = name.trim().replace(/-+$/, '');
  const taken = !!clean && [...(joined ?? []).map((c) => c.name), ...known, ...rejected].some((n) => n.toLowerCase() === clean);
  const ready = !!clean && !taken && !busy && !!space;

  const create = async () => {
    if (!ready) return;
    setBusy(true);
    setFailed(null);
    try {
      const id = await store.createChannel({ spaceId, name: clean, private: isPrivate });
      onClose();
      navigate(channelPath(spaceId, id));
    } catch (e) {
      if (e instanceof Error && e.message === 'taken') setRejected((r) => [...r, clean]);
      else setFailed(clean);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t('channels.newChannel')}
      closeLabel={t('people.close')}
      width={500}
      bodyClassName={s.createBody}
      footer={
        <>
          <span className={s.spacer} />
          <Button variant="secondary" onClick={onClose}>
            {t('people.cancel')}
          </Button>
          <Button disabled={!ready} onClick={() => void create()}>
            {t('channels.create')}
          </Button>
        </>
      }
    >
      <div className={s.stack}>
        {space && (
          <Menu modal={false}>
            <MenuTrigger asChild>
              <button type="button" className={s.picker} aria-label={t('channels.space')}>
                <SpaceMark space={space} />
                <span className={s.pickerName}>{space.name}</span>
                <span className={s.pickerChevron}>
                  <ChevronIcon size={16} />
                </span>
              </button>
            </MenuTrigger>
            <MenuContent align="start" sideOffset={6} className={s.pickerMenu} aria-label={t('channels.space')}>
              {spaces.map((sp) => (
                <MenuItem
                  key={sp.id}
                  className={s.option}
                  data-selected={sp.id === spaceId ? '' : undefined}
                  icon={<SpaceMark space={sp} corner />}
                  onSelect={() => setSpaceId(sp.id)}
                >
                  <span className={s.optionName}>{sp.name}</span>
                  {sp.id === spaceId && (
                    <span className={s.optionCheck}>
                      <CheckIcon size={16} />
                    </span>
                  )}
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>
        )}
        <div>
          <div className={[s.nameField, taken && s.invalid].filter(Boolean).join(' ')}>
            <span className={s.nameIcon}>
              {isPrivate ? (
                <span key="lock" className={s.lockPop}>
                  <LockIcon size={17} strokeWidth={2.1} />
                </span>
              ) : (
                <HashIcon size={17} strokeWidth={2.1} />
              )}
            </span>
            <input
              className={s.input}
              autoFocus
              autoComplete="off"
              maxLength={80}
              aria-label={t('channels.name')}
              aria-invalid={taken || undefined}
              placeholder={t('channels.name')}
              value={name}
              onChange={(e) => setName(channelSlug(e.target.value))}
              onKeyDown={(e) => {
                if (isImeEnter(e)) {
                  e.preventDefault();
                  void create();
                }
              }}
            />
          </div>
          {taken && (
            <p role="alert" className={s.error}>
              <AlertIcon />
              {t('channels.taken', { name: clean })}
            </p>
          )}
          {!taken && failed === clean && (
            <p role="alert" className={s.error}>
              <AlertIcon />
              {t('channels.createFailed', { name: clean })}
            </p>
          )}
        </div>
        <label className={s.switchRow}>
          <span>
            <LockIcon size={17} strokeWidth={2} />
          </span>
          <span className={s.switchLabel}>{t('channels.private')}</span>
          <button type="button" role="switch" aria-checked={isPrivate} aria-label={t('channels.private')} className={s.switch} onClick={() => setPrivate(!isPrivate)} />
        </label>
      </div>
    </Dialog>
  );
}
