// @vitest-environment happy-dom
// M1-07: the shell runs on an empty registry, and stored tabs whose feature is gone are skipped without errors.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { features } from '../features';
import { WorkspaceProvider } from '../matrix';
import { initI18n } from './i18n';
import { buildRegistry, defineFeature, visibleTabs, type Feature, type ScreenContext, type StoredTab } from './registry';
import { closeAssistant, openAssistant, toggleAssistant } from './rightPanel';
import { RegistryProvider } from './RegistryProvider';
import { ChannelTabs } from './shell/ChannelTabs';
import { Workspace } from './shell/Shell';
import { createFakeStore } from './testing/fakeStore';

initI18n();
afterEach(() => {
  cleanup();
  closeAssistant();
});

const storedFixture: StoredTab[] = [
  { id: 'tab-files', type: 'files' },
  { id: 'tab-pins', type: 'pins' },
  { id: 'tab-docs', type: 'work.pasodrum.docs' },
];

const pins = defineFeature({
  id: 'pins',
  rail: [{ id: 'pins', to: '/pins', icon: null, useLabel: () => 'Pinboard' }],
  channelTabs: [{ type: 'pins', icon: null, useLabel: () => 'Pins', View: ({ channelId }) => <p>pins of {channelId}</p> }],
});

function renderShell(list: readonly Feature[], tabs?: readonly StoredTab[], at = '/w/!pasodrum/c/!general') {
  const errors = vi.spyOn(console, 'error');
  render(
    <RegistryProvider features={list}>
      <WorkspaceProvider store={createFakeStore()}>
        <MemoryRouter initialEntries={[at]}>
          {tabs ? (
            <Routes>
              <Route path="*" element={<ChannelTabs channelId="!general" stored={tabs} />} />
            </Routes>
          ) : (
            <Workspace onSignOut={() => {}} />
          )}
        </MemoryRouter>
      </WorkspaceProvider>
    </RegistryProvider>,
  );
  return errors;
}

const tabNames = () => within(screen.getByRole('tablist')).getAllByRole('tab').map((t) => t.textContent);

describe('feature registry', () => {
  it('builds from whatever is registered, each feature once', () => {
    const ids = features.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(buildRegistry(features).rail).toEqual(features.flatMap((f) => f.rail ?? []));
  });

  it('renders the shell with features = [] and only the Messages tab', () => {
    const errors = renderShell([]);
    expect(screen.getByRole('heading', { level: 1, name: 'general' })).toBeTruthy();
    expect(tabNames()).toEqual(['Messages']);
    expect(errors).not.toHaveBeenCalled();
  });

  it('renders the shell with the assistant slot empty: thread as before, no header button, ⌘J does nothing', async () => {
    expect(buildRegistry([]).assistant).toBeUndefined();
    const errors = renderShell([], undefined, '/w/!pasodrum/c/!general?thread=$!general-1');
    expect(screen.getByRole('complementary', { name: 'Thread' })).toBeTruthy();
    const keys = new KeyboardEvent('keydown', { key: 'j', metaKey: true, cancelable: true });
    act(() => void document.dispatchEvent(keys));
    act(() => openAssistant());
    expect(keys.defaultPrevented).toBe(false);
    expect(screen.getByRole('complementary', { name: 'Thread' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ask' })).toBeNull();
    expect(errors).not.toHaveBeenCalled();
  });

  it('draws the assistant in the thread’s place, the one opened last on top', async () => {
    const screens: (ScreenContext | null)[] = [];
    const toggle = vi.fn(toggleAssistant);
    const assistant = defineFeature({
      id: 'assistant',
      assistant: {
        Panel: () => <aside aria-label="Assistant" />,
        useHeaderButton: () => ({ icon: null, label: 'Ask', pressed: false, dot: false, run: openAssistant }),
        useSwitcherRow: () => null,
        useScreen: (ctx) => void screens.push(ctx),
        toggle,
      },
    });
    renderShell([assistant], undefined, '/w/!pasodrum/c/!general?thread=$!general-1');
    const thread = () => screen.queryByRole('complementary', { name: 'Thread' });
    const panel = () => screen.queryByRole('complementary', { name: 'Assistant' });
    expect(thread()).toBeTruthy();
    expect(panel()).toBeNull();
    expect(screens.some((c) => c?.kind === 'thread' && c.layer === 'panel' && c.refs[0]?.k === 'thread')).toBe(true);
    expect(screens.some((c) => c?.kind === 'channel' && c.refs[0]?.k === 'place')).toBe(true);
    expect(JSON.stringify(screens)).not.toContain('Nordlys review');

    fireEvent.click(screen.getAllByRole('button', { name: 'Ask' })[0]!);
    expect(panel()).toBeTruthy();
    expect(thread()).toBeNull();

    // Opening the thread again puts it back on top; closing it shows the assistant.
    fireEvent.click(await screen.findByRole('button', { name: '4 replies' }));
    expect(thread()).toBeTruthy();
    expect(panel()).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close thread' }));
    expect(thread()).toBeNull();
    expect(panel()).toBeTruthy();

    act(() => void document.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', ctrlKey: true, cancelable: true })));
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(panel()).toBeNull();
  });

  it('skips stored tabs whose types are not registered', () => {
    const errors = renderShell([], storedFixture);
    expect(tabNames()).toEqual(['Messages']);
    expect(errors).not.toHaveBeenCalled();
  });

  it('shows stored ∩ registered tabs and rail items from features', () => {
    renderShell([pins], storedFixture);
    expect(tabNames()).toEqual(['Messages', 'Pins']);
    fireEvent.click(screen.getByRole('tab', { name: 'Pins' }));
    expect(screen.getByText('pins of !general')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Pins' }).getAttribute('aria-selected')).toBe('true');
    cleanup();
    renderShell([pins]);
    expect(screen.getByRole('link', { name: 'Pinboard' })).toBeTruthy();
  });

  it('draws feature message parts under messages and built-in tabs before stored ones; none without features', async () => {
    const parts = defineFeature({
      id: 'parts',
      messageParts: [{ id: 'part', Part: ({ message }) => (message.links?.length ? <p>card for {message.links[0]}</p> : null) }],
      channelTabs: [{ type: 'files', builtIn: true, icon: null, useLabel: () => 'Files', View: () => null }],
    });
    renderShell([parts, pins], storedFixture);
    expect(tabNames()).toEqual(['Messages', 'Files', 'Pins']);
    cleanup();
    renderShell([parts]);
    expect((await screen.findAllByText(/^card for https:/)).length).toBeGreaterThan(0);
    cleanup();
    renderShell([]);
    await screen.findByRole('log');
    expect(screen.queryByText(/^card for/)).toBeNull();
  });

  it('computes visible tabs as stored ∩ registered without duplicates', () => {
    const registry = buildRegistry([pins]);
    expect(visibleTabs([...storedFixture, { id: 'tab-pins', type: 'pins' }], registry).map((t) => t.id)).toEqual(['tab-pins']);
    expect(visibleTabs(storedFixture, buildRegistry([]))).toEqual([]);
  });
});
