// @vitest-environment happy-dom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFakeBackend } from '../../dev/fakeBackend';
import { AppRoutes } from '../App';
import { initI18n, setLanguage } from '../i18n';

initI18n();

beforeEach(async () => {
  localStorage.clear();
  await setLanguage('en');
});
afterEach(cleanup);

describe('outside mark beside Send (ExternalDM)', () => {
  it('shows the client in a DM header and beside Send, with their name in the accessible name', async () => {
    render(
      <MemoryRouter initialEntries={['/dms/!dm-henrik']}>
        <AppRoutes backend={createFakeBackend()} />
      </MemoryRouter>,
    );
    await act(() => new Promise((r) => setTimeout(r, 0)));
    const label = 'Includes people outside Pasodrum: Henrik Dahl';
    const marks = screen.getAllByRole('img', { name: label });
    expect(marks).toHaveLength(2);
    const header = screen.getByRole('main').querySelector('header')!;
    expect(within(header).getByRole('img', { name: label })).toBeTruthy();
  });

  it('stays away from DMs with team people only', async () => {
    render(
      <MemoryRouter initialEntries={['/dms/!dm-jonas']}>
        <AppRoutes backend={createFakeBackend()} />
      </MemoryRouter>,
    );
    await act(() => new Promise((r) => setTimeout(r, 0)));
    expect(screen.queryByRole('img', { name: /outside/ })).toBeNull();
  });
});
