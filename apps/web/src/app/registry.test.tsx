// @vitest-environment happy-dom
// M1-07: the shell runs on an empty registry, and stored tabs whose feature is gone are skipped without errors.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { features } from '../features';
import { WorkspaceProvider } from '../matrix';
import { initI18n } from './i18n';
import { buildRegistry, defineFeature, visibleTabs, type Feature, type StoredTab } from './registry';
import { RegistryProvider } from './RegistryProvider';
import { ChannelTabs } from './shell/ChannelTabs';
import { Workspace } from './shell/Shell';
import { createFakeStore } from './testing/fakeStore';

initI18n();
afterEach(cleanup);

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

function renderShell(list: readonly Feature[], tabs?: readonly StoredTab[]) {
  const errors = vi.spyOn(console, 'error');
  render(
    <RegistryProvider features={list}>
      <WorkspaceProvider store={createFakeStore()}>
        <MemoryRouter initialEntries={['/w/!pasodrum/c/!general']}>
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
