// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Dialog } from './Dialog';
import { Menu, MenuContent, MenuItem, MenuTrigger } from './Menu';

afterEach(cleanup);

function MenuWithDialog() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <button type="button">Profile</button>
        </MenuTrigger>
        <MenuContent aria-label="Profile menu">
          <MenuItem onSelect={() => setOpen(true)}>Another app</MenuItem>
        </MenuContent>
      </Menu>
      <Dialog open={open} onOpenChange={setOpen} title="Another app" closeLabel="Close" />
    </>
  );
}

describe('dialogs opened from a menu item', () => {
  it('give focus back to the menu trigger when they close', async () => {
    render(<MenuWithDialog />);
    const trigger = screen.getByRole('button', { name: 'Profile' });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Another app' }));
    await screen.findByRole('dialog', { name: 'Another app' });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await act(() => new Promise((r) => setTimeout(r, 10)));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
