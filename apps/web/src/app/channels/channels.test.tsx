// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeBackend } from '../../dev/fakeBackend';
import type { Role } from '../../matrix';
import { AppRoutes } from '../App';
import { initI18n, setLanguage } from '../i18n';
import { roleChoices } from './roles';

initI18n();

function Where() {
  const l = useLocation();
  return <span data-testid="where">{l.pathname + l.search}</span>;
}

function renderApp(path: string, roles?: Record<string, Role>) {
  const backend = createFakeBackend(roles ? { roles } : {});
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes backend={backend} />
      <Where />
    </MemoryRouter>,
  );
  return { store: () => backend.stores.at(-1)!, where: () => screen.getByTestId('where').textContent };
}

const flush = () => act(async () => {});
const sidebar = () => screen.getByRole('complementary', { name: 'Pasodrum navigation' });
const header = () => screen.getByRole('main').querySelector('header')!;
const openMenu = (el: HTMLElement) => fireEvent.keyDown(el, { key: 'Enter' });
const dialog = () => screen.getByRole('dialog');

let writeText: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  localStorage.clear();
  await setLanguage('en');
  writeText = vi.fn(() => Promise.resolve());
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});
afterEach(cleanup);

describe('new channel', () => {
  it('creates a private channel from the + beside Channels and opens it', async () => {
    const { where } = renderApp('/w/!pasodrum/c/!design');
    openMenu(within(sidebar()).getByRole('button', { name: 'Add a channel' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'New channel' }));
    const name = within(dialog()).getByRole('textbox', { name: 'Name' });
    fireEvent.change(name, { target: { value: 'Launch Plan' } });
    expect((name as HTMLInputElement).value).toBe('launch-plan');
    const create = within(dialog()).getByRole('button', { name: 'Create' });
    fireEvent.click(within(dialog()).getByRole('switch', { name: 'Private' }));
    fireEvent.click(create);
    await flush();
    expect(where()).toMatch(/^\/w\/!pasodrum\/c\/!ch-/);
    expect(within(sidebar()).getByRole('link', { name: 'launch-plan' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: /launch-plan/ })).toBeTruthy();
  });

  it('says when the name exists, including names only the server knows', async () => {
    const { store } = renderApp('/w/!pasodrum/c/!design');
    openMenu(within(sidebar()).getByRole('button', { name: 'Pasodrum' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'New channel' }));
    await flush();
    const name = within(dialog()).getByRole('textbox', { name: 'Name' });
    fireEvent.change(name, { target: { value: 'design' } });
    expect(within(dialog()).getByRole('alert').textContent).toBe('#design already exists');
    expect((within(dialog()).getByRole('button', { name: 'Create' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(name, { target: { value: 'sales' } });
    expect(within(dialog()).getByRole('alert').textContent).toBe('#sales already exists');

    // A name taken between typing and Create: the store answers Error('taken').
    const createChannel = vi.spyOn(store(), 'createChannel').mockRejectedValueOnce(new Error('taken'));
    fireEvent.change(name, { target: { value: 'brand-new' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Create' }));
    await flush();
    expect(createChannel).toHaveBeenCalledWith({ spaceId: '!pasodrum', name: 'brand-new', private: false });
    expect(within(dialog()).getByRole('alert').textContent).toBe('#brand-new already exists');
  });

  it('hides creating and browsing from guests', () => {
    renderApp('/w/!pasodrum/c/!design', { '!pasodrum': 'guest' });
    expect(within(sidebar()).queryByRole('button', { name: 'Add a channel' })).toBeNull();
    expect(within(sidebar()).queryByRole('button', { name: 'Pasodrum' })).toBeNull();
    expect(within(sidebar()).queryByRole('button', { name: 'Add people' })).toBeNull();
    expect(within(header()).queryByRole('button', { name: 'Add people' })).toBeNull();
    expect(within(screen.getByRole('main')).queryByRole('button', { name: 'Add people' })).toBeNull();
  });
});

describe('browse channels', () => {
  it('lists joined and joinable channels and joins one', async () => {
    renderApp('/w/!pasodrum/channels');
    await flush();
    const list = screen.getByRole('list', { name: 'Channels' });
    expect(within(list).getAllByRole('listitem').length).toBe(9);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search channels' }), { target: { value: 'sal' } });
    const row = within(list).getByRole('listitem');
    fireEvent.click(within(row).getByRole('button', { name: 'Join #sales' }));
    await flush();
    expect(within(row).getByText('Joined')).toBeTruthy();
    expect(within(sidebar()).getByRole('link', { name: 'sales' })).toBeTruthy();
  });
});

describe('channel details', () => {
  it('copies the plain channel address and edits the topic', async () => {
    const { store } = renderApp('/w/!pasodrum/c/!design');
    fireEvent.click(within(header()).getByRole('button', { name: 'Channel details' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Copy link' }));
    await flush();
    expect(writeText).toHaveBeenCalledWith(`${location.origin}/w/!pasodrum/c/!design`);
    expect(within(dialog()).getByRole('button', { name: 'Link copied' })).toBeTruthy();

    fireEvent.click(within(dialog()).getByRole('button', { name: 'Edit' }));
    fireEvent.change(within(dialog()).getByRole('textbox', { name: 'Topic' }), { target: { value: 'Critiques on Fridays' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Save' }));
    await flush();
    expect(within(dialog()).getByText('Critiques on Fridays')).toBeTruthy();
    expect(store().getSnapshot().channels['!pasodrum']!.find((c) => c.id === '!design')!.topic).toBe('Critiques on Fridays');
  });

  it('leaves a public channel at once', async () => {
    const { where } = renderApp('/w/!pasodrum/c/!general');
    fireEvent.click(within(header()).getByRole('button', { name: 'Channel details' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Leave channel' }));
    await flush();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(within(sidebar()).queryByRole('link', { name: 'general' })).toBeNull();
    expect(where()).not.toContain('!general');
  });

  it('asks before leaving a private channel', async () => {
    renderApp('/w/!pasodrum/c/!lead');
    fireEvent.click(within(header()).getByRole('button', { name: 'Channel details' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Leave channel' }));
    const ask = await screen.findByRole('alertdialog', { name: 'Leave #lead?' });
    fireEvent.click(within(ask).getByRole('button', { name: 'Leave' }));
    await flush();
    expect(within(sidebar()).queryByRole('link', { name: /lead/ })).toBeNull();
  });

  it('lists members with role tags and a pending person with their join link', async () => {
    renderApp('/w/!pasodrum/c/!design');
    fireEvent.click(within(header()).getByRole('button', { name: '8 members' }));
    await flush();
    const list = within(dialog()).getByRole('list', { name: 'Members' });
    const rows = within(list).getAllByRole('listitem').map((r) => r.textContent);
    expect(rows[0]).toContain('Ingrid HolmOwner');
    expect(rows).toContain('OFOla FjellGuest');
    expect(rows.at(-1)).toContain('kari@nordlys.noPending');
    openMenu(within(list).getByRole('button', { name: 'More for kari@nordlys.no' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Copy join link' }));
    await flush();
    expect(writeText).toHaveBeenCalledWith('https://pasodrum.work/join/kari');
  });

  it('keeps member controls from Members', async () => {
    renderApp('/w/!pasodrum/c/!design', { '!pasodrum': 'member' });
    fireEvent.click(within(header()).getByRole('button', { name: 'Channel details' }));
    expect(within(dialog()).queryByRole('button', { name: 'Edit' })).toBeNull();
    fireEvent.click(within(dialog()).getByRole('tab', { name: /Members/ }));
    await flush();
    expect(within(dialog()).queryByRole('button', { name: 'More for Maja Lind' })).toBeNull();
  });
});

describe('roles (D-25, D-27)', () => {
  it('offers Owner/Admin/Member to Owners, Admin/Member to Admins, and never touches Owners or yourself', () => {
    expect(roleChoices('owner', 'admin', false)).toEqual(['owner', 'admin', 'member']);
    expect(roleChoices('admin', 'member', false)).toEqual(['admin', 'member']);
    expect(roleChoices('owner', 'owner', false)).toEqual([]);
    expect(roleChoices('admin', 'owner', false)).toEqual([]);
    expect(roleChoices('owner', 'member', true)).toEqual([]);
    expect(roleChoices('member', 'admin', false)).toEqual([]);
    expect(roleChoices('owner', 'guest', false)).toEqual([]);
  });

  async function openCard(role: Role, name: string) {
    const app = renderApp('/w/!pasodrum/c/!design', { '!pasodrum': role });
    fireEvent.click(within(header()).getByRole('button', { name: '8 members' }));
    await flush();
    fireEvent.click(within(dialog()).getByRole('button', { name }));
    await flush();
    await flush();
    return app;
  }

  it('lets an Owner make someone an owner, asking once', async () => {
    const { store } = await openCard('owner', 'Jonas Berg');
    const setRole = vi.spyOn(store(), 'setRole');
    fireEvent.click(screen.getByRole('button', { name: 'Role: Jonas Berg' }));
    expect(screen.getAllByRole('menuitemradio').map((x) => x.textContent)).toEqual(['Owner', 'Admin', 'Member']);
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Owner' }));
    const ask = await screen.findByRole('alertdialog', { name: 'Make Jonas Berg an owner?' });
    expect(setRole).not.toHaveBeenCalled();
    fireEvent.click(within(ask).getByRole('button', { name: 'Make owner' }));
    await flush();
    expect(setRole).toHaveBeenCalledWith('!pasodrum', '@jonas:pasodrum.localhost', 'owner');
  });

  it('lets an Admin switch Admin and Member without asking', async () => {
    const { store } = await openCard('admin', 'Maja Lind');
    const setRole = vi.spyOn(store(), 'setRole');
    fireEvent.click(screen.getByRole('button', { name: 'Role: Maja Lind' }));
    expect(screen.getAllByRole('menuitemradio').map((x) => x.textContent)).toEqual(['Admin', 'Member']);
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Admin' }));
    await flush();
    expect(setRole).toHaveBeenCalledWith('!pasodrum', '@maja:pasodrum.localhost', 'admin');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('shows an Owner as a tag only, and no role control to Members', async () => {
    await openCard('owner', 'Ingrid Holm');
    expect(screen.queryByRole('button', { name: 'Role: Ingrid Holm' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Profile: Ingrid Holm' }).textContent).toContain('Owner');
    cleanup();
    await openCard('member', 'Jonas Berg');
    expect(screen.queryByRole('button', { name: 'Role: Jonas Berg' })).toBeNull();
  });
});

describe('add people', () => {
  const open = async (path = '/w/!pasodrum/c/!design', roles?: Record<string, Role>) => {
    const app = renderApp(path, roles);
    fireEvent.click(within(header()).getByRole('button', { name: 'Add people' }));
    await flush();
    return app;
  };
  const input = () => within(dialog()).getByRole('textbox', { name: 'Name or email' });
  const enter = (text: string) => {
    fireEvent.change(input(), { target: { value: text } });
    fireEvent.keyDown(input(), { key: 'Enter' });
  };

  it('Owners pick Member or Guest; an outside email makes it Guest', async () => {
    const { store } = await open();
    const addPeople = vi.spyOn(store(), 'addPeople');
    expect(within(dialog()).getByRole('group', { name: 'Role' })).toBeTruthy();
    fireEvent.change(input(), { target: { value: '田中' } });
    await flush();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Add 田中 由紀' }));
    enter('kari@nordlys.no');
    expect((within(dialog()).getByRole('button', { name: 'Member' }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(dialog()).getByRole('button', { name: 'Guest' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(dialog()).getByText('Guest', { selector: 'span' })).toBeTruthy();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Add 2 people' }));
    await flush();
    expect(addPeople).toHaveBeenCalledWith('!design', { userIds: ['@tanaka:pasodrum.localhost'], emails: ['kari@nordlys.no'], role: 'guest' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('adds to the space from the space menu', async () => {
    const { store } = renderApp('/w/!pasodrum/c/!design');
    const addPeople = vi.spyOn(store(), 'addPeople');
    openMenu(within(sidebar()).getByRole('button', { name: 'Pasodrum' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Add people' }));
    await flush();
    expect(within(dialog()).getByRole('heading', { name: 'Add people to Pasodrum' })).toBeTruthy();
    expect(within(dialog()).queryByRole('group', { name: 'Role' })).toBeNull();
    enter('kari@nordlys.no');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Add 1 person' }));
    await flush();
    expect(addPeople).toHaveBeenCalledWith('!pasodrum', { userIds: [], emails: ['kari@nordlys.no'], role: 'member' });
  });

  it('opens from the empty channel too', async () => {
    renderApp('/w/!pasodrum/c/!design');
    const main = screen.getByRole('main');
    const empty = within(main).getAllByRole('button', { name: 'Add people' }).find((b) => !header().contains(b))!;
    fireEvent.click(empty);
    await flush();
    expect(within(dialog()).getByRole('heading', { name: 'Add people to #design' })).toBeTruthy();
  });

  it('Members add guests only, with no switch', async () => {
    const { store } = await open('/w/!pasodrum/c/!design', { '!pasodrum': 'member', '!nordlys': 'member' });
    const addPeople = vi.spyOn(store(), 'addPeople');
    expect(within(dialog()).queryByRole('group', { name: 'Role' })).toBeNull();
    enter('new@pasodrum.work');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Add 1 person' }));
    await flush();
    expect(addPeople).toHaveBeenCalledWith('!design', { userIds: [], emails: ['new@pasodrum.work'], role: 'guest' });
  });

  it('adds clients in a client space', async () => {
    const { store } = await open('/w/!nordlys/c/!project-updates');
    const addPeople = vi.spyOn(store(), 'addPeople');
    enter('kari@nordlys.no');
    expect(within(dialog()).getByText('Client')).toBeTruthy();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Add 1 person' }));
    await flush();
    expect(addPeople.mock.calls[0]![1].role).toBe('client');
  });

  it('marks a bad email, shows who is already in, and keeps what the server refused', async () => {
    const { store } = await open();
    expect(within(dialog()).getAllByText('In channel').length).toBeGreaterThan(0);
    enter('henrik@nordlys');
    expect(within(dialog()).getByRole('alert').textContent).toBe('henrik@nordlys isn’t an email address');
    expect(within(dialog()).getByRole('button', { name: 'Add people' }).hasAttribute('disabled')).toBe(true);
    enter('boss@notallowed.no');
    expect(within(dialog()).getByRole('button', { name: 'Add 1 person' })).toBeTruthy();
    vi.spyOn(store(), 'addPeople');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Remove henrik@nordlys' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Add 1 person' }));
    await flush();
    expect(within(dialog()).getByRole('alert').textContent).toBe('Couldn’t add boss@notallowed.no');
  });

  it('copies a pending person’s join link', async () => {
    await open();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Copy join link' }));
    await flush();
    expect(writeText).toHaveBeenCalledWith('https://pasodrum.work/join/kari');
  });

  it('never says “invite” in English', async () => {
    const en = (await import('../../locales/en.json')).default as { channels: Record<string, unknown> };
    expect(JSON.stringify(en.channels)).not.toMatch(/invit/i);
  });
});

describe('rename and archive (E2): who sees them', () => {
  const settings = async (name: string) => {
    fireEvent.click(within(header()).getByRole('button', { name }));
    fireEvent.click(await within(dialog()).findByRole('tab', { name: 'Settings' }));
    return within(screen.getByRole('tabpanel'));
  };

  it('Owners get Name and Archive channel; #general never does', async () => {
    renderApp('/w/!pasodrum/c/!design');
    const panel = await settings('design');
    expect(panel.getByRole('textbox', { name: 'Name' })).toBeTruthy();
    expect(panel.getByRole('button', { name: 'Archive channel' })).toBeTruthy();
    cleanup();

    renderApp('/w/!pasodrum/c/!general');
    const general = await settings('general');
    expect(general.queryByRole('textbox', { name: 'Name' })).toBeNull();
    expect(general.queryByRole('button', { name: 'Archive channel' })).toBeNull();
    expect(general.getByRole('radiogroup', { name: 'Notifications' })).toBeTruthy();
  });

  it('Members see Notifications only', async () => {
    renderApp('/w/!pasodrum/c/!design', { '!pasodrum': 'member', '!nordlys': 'member' });
    const panel = await settings('design');
    expect(panel.queryByRole('textbox', { name: 'Name' })).toBeNull();
    expect(panel.queryByRole('button', { name: 'Archive channel' })).toBeNull();
    expect(panel.getByRole('radiogroup', { name: 'Notifications' })).toBeTruthy();
  });
});
