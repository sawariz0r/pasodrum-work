// Sidebar entry points (WorkspaceMenu, ChannelsPlusMenu) and the channel header (Main m4).
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useStore, useWorkspace, type Channel, type Space } from '../../matrix';
import { Button, IconButton, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../../ui';
import { HashIcon, LockIcon } from '../icons';
import { Face } from '../people/Face';
import { spaceHome } from '../places';
import { ChevronDownIcon, PlusIcon as SmallPlusIcon } from '../shell/icons';
import s from './Channels.module.css';
import { useChannels } from './ChannelsProvider';
import { ChevronIcon, GearIcon, InfoIcon, PlusIcon, SpacesIcon, UserPlusIcon } from './icons';
import { OutsideHeaderMark, useOutside } from './OutsideMark';
import { addRoles, canBrowse, canCreateIn, canManage } from './roles';
import { findChannel, SpaceMark, useRole, useSpace } from './shared';

export function browsePath(spaceId: string) {
  return `/w/${encodeURIComponent(spaceId)}/channels`;
}

/** The channel the row under the channel list adds to: the one you're in, else the space's home channel. */
function useAddTarget(space: Space, channelId?: string): string | undefined {
  const home = useWorkspace((x) => spaceHome(x, space.id)?.id);
  return channelId ?? home;
}

/**
 * The space name opens its menu (RulesM5): Browse, New channel, Add people (to the space), and for Owners/Admins New client space
 * (workspace) or Client space settings (client space). Clients only browse; guests get a plain heading.
 */
export function WorkspaceMenu({ space, className }: { space: Space; className?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const channels = useChannels();
  const role = useRole(space.id);
  const open = !space.archived;
  const manage = canManage(role);
  const browse = canBrowse(role);
  const create = open && canCreateIn(role);
  const add = open && addRoles(space, role).length > 0 && (manage || space.kind === 'client');
  const newSpace = manage && space.kind === 'workspace';
  const settings = manage && space.kind === 'client';
  if (!browse && !create && !add && !newSpace && !settings) return <h2 className={className}>{space.name}</h2>;
  return (
    <div className={s.spaceMenu}>
    <Menu modal={false}>
      <MenuTrigger asChild>
        <button type="button" className={s.spaceButton}>
          <span>{space.name}</span>
          <ChevronIcon size={15} />
        </button>
      </MenuTrigger>
      <MenuContent align="start" sideOffset={6} width={264} aria-label={space.name} onCloseAutoFocus={(e) => e.preventDefault()}>
        <div className={s.menuHead}>
          <SpaceMark space={space} large />
          <span className={s.menuHeadName}>{space.name}</span>
        </div>
        <div className={s.menuHeadRule} />
        {browse && (
          <MenuItem icon={<HashIcon />} onSelect={() => navigate(browsePath(space.id))}>
            {t('channels.browseChannels')}
          </MenuItem>
        )}
        {create && (
          <MenuItem icon={<PlusIcon />} onSelect={() => channels.newChannel(space.id)}>
            {t('channels.newChannel')}
          </MenuItem>
        )}
        {(add || newSpace || settings) && (browse || create) && <MenuSeparator />}
        {add && (
          <MenuItem icon={<UserPlusIcon size={16} strokeWidth={2} />} onSelect={() => channels.addPeople(space.id)}>
            {t('common.addPeople')}
          </MenuItem>
        )}
        {newSpace && (
          <MenuItem icon={<SpacesIcon />} onSelect={() => channels.newClientSpace()}>
            {t('spaces.newClientSpace')}
          </MenuItem>
        )}
        {settings && (
          <MenuItem icon={<GearIcon />} onSelect={() => channels.spaceSettings(space.id)}>
            {t('spaces.settings')}
          </MenuItem>
        )}
      </MenuContent>
    </Menu>
    </div>
  );
}

/** The + beside Channels: New channel, Browse channels. Team only. */
export function ChannelsPlusMenu({ space, className }: { space: Space; className?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const channels = useChannels();
  const role = useRole(space.id);
  const browse = canBrowse(role);
  const create = canCreateIn(role);
  // RulesM5: clients and guests get no + here (clients browse from the space menu).
  if (!create || space.archived) return null;
  return (
    <Menu modal={false}>
      <MenuTrigger asChild>
        <IconButton size={24} className={className} label={t('shell.sidebar.addChannel')} icon={<SmallPlusIcon size={14} strokeWidth={2.2} />} />
      </MenuTrigger>
      <MenuContent align="start" side="right" width={220} aria-label={t('shell.sidebar.addChannel')} onCloseAutoFocus={(e) => e.preventDefault()}>
        {create && (
          <MenuItem icon={<PlusIcon />} onSelect={() => channels.newChannel(space.id)}>
            {t('channels.newChannel')}
          </MenuItem>
        )}
        {browse && (
          <MenuItem icon={<HashIcon />} onSelect={() => navigate(browsePath(space.id))}>
            {t('channels.browseChannels')}
          </MenuItem>
        )}
      </MenuContent>
    </Menu>
  );
}

/** "Add people" under the channel list, for anyone who may add people here. */
export function SidebarAddPeople({ space, channelId }: { space: Space; channelId?: string }) {
  const { t } = useTranslation();
  const channels = useChannels();
  const role = useRole(space.id);
  const target = useAddTarget(space, channelId);
  if (!target || !addRoles(space, role).length || space.archived) return null;
  return (
    <button type="button" className={s.addRow} onClick={() => channels.addPeople(target)}>
      <span className={s.addRowIcon}>
        <SmallPlusIcon size={12} strokeWidth={2.6} />
      </span>
      {t('common.addPeople')}
    </button>
  );
}

/** The empty channel's Add people (Main m4 empty state); the same dialog as the header button. */
export function EmptyChannelAddPeople({ channelId }: { channelId: string }) {
  const { t } = useTranslation();
  const channels = useChannels();
  const spaceId = useWorkspace((x) => findChannel(x, channelId)?.spaceId);
  const space = useSpace(spaceId);
  const role = useRole(spaceId);
  if (!addRoles(space, role).length || space?.archived) return null;
  return (
    <Button className={s.emptyAdd} icon={<UserPlusIcon size={16} strokeWidth={2} />} onClick={() => channels.addPeople(channelId)}>
      {t('common.addPeople')}
    </Button>
  );
}

/** Header: name (opens details), member faces (opens Members), Add people, details. */
export function ChannelHeaderBar({ channel }: { channel: Channel }) {
  const { t } = useTranslation();
  const store = useStore();
  const channels = useChannels();
  const space = useWorkspace((x) => x.spaces.find((sp) => sp.id === channel.spaceId));
  const role = useRole(channel.spaceId);
  const faces = useMemo(() => store.members(channel.id).slice(0, 3), [store, channel.id, channel.memberCount]); // eslint-disable-line react-hooks/exhaustive-deps
  const mayAdd = addRoles(space, role).length > 0 && !space?.archived;
  const outside = useOutside(channel.id);
  return (
    <>
      <h1 className={s.nameHeading}>
        <button type="button" className={s.nameButton} aria-haspopup="dialog" onClick={() => channels.details(channel.id)}>
          {channel.private ? <LockIcon size={18} strokeWidth={2.1} /> : <HashIcon size={18} strokeWidth={2.1} />}
          <span>{channel.name}</span>
          <ChevronDownIcon size={15} strokeWidth={2.2} />
        </button>
      </h1>
      <OutsideHeaderMark people={outside} onClick={() => channels.details(channel.id, 'members')} />
      <span className={s.headSpacer} />
      <button
        type="button"
        className={s.facesButton}
        aria-label={t('shell.header.members', { count: channel.memberCount })}
        onClick={() => channels.details(channel.id, 'members')}
      >
        <span className={s.faces}>
          {faces.map((p) => (
            <Face key={p.id} person={p} size={20} className={s.face} />
          ))}
        </span>
        {channel.memberCount}
      </button>
      <span className={s.headIcons}>
        {mayAdd && <IconButton label={t('common.addPeople')} icon={<UserPlusIcon />} onClick={() => channels.addPeople(channel.id)} />}
        <IconButton label={t('shell.header.details')} icon={<InfoIcon />} onClick={() => channels.details(channel.id)} />
      </span>
    </>
  );
}
