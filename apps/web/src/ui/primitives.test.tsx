// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Avatar, avatarColor, Banner, Button, Dialog, IconButton, Menu, MenuContent, MenuItem, MenuSegments, MenuTrigger, TextField } from '.';

afterEach(cleanup);

describe('Button', () => {
  it('is a non-submitting button by default and forwards clicks', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    const b = screen.getByRole('button', { name: 'Save' });
    expect(b.getAttribute('type')).toBe('button');
    fireEvent.click(b);
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe('IconButton', () => {
  it('exposes its label as the accessible name', () => {
    render(<IconButton label="Close" icon={<svg />} />);
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
  });
});

describe('TextField', () => {
  it('links label, input and error', () => {
    render(<TextField label="Password" type="password" error="Wrong password" />);
    const input = screen.getByLabelText('Password');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const err = screen.getByRole('alert');
    expect(err.textContent).toBe('Wrong password');
    expect(input.getAttribute('aria-describedby')).toBe(err.id);
  });

  it('has no error wiring when valid', () => {
    render(<TextField label="Work email" />);
    const input = screen.getByLabelText('Work email');
    expect(input.hasAttribute('aria-invalid')).toBe(false);
    expect(input.hasAttribute('aria-describedby')).toBe(false);
  });
});

describe('Avatar', () => {
  it('renders initials per the Foundations rule', () => {
    const { container, rerender } = render(<Avatar name="Ingrid Holm" color="#C2410C" />);
    expect(container.textContent).toBe('IH');
    rerender(<Avatar name="平野 いずみ" color="#C2410C" />);
    expect(container.textContent).toBe('平');
  });

  it('picks a stable palette colour', () => {
    expect(avatarColor('@ingrid:pasodrum.work')).toBe(avatarColor('@ingrid:pasodrum.work'));
    expect(avatarColor('x')).toMatch(/^#[0-9A-F]{6}$/);
  });
});

describe('Banner', () => {
  it('announces status and offers the action only when given', () => {
    const onAction = vi.fn();
    const { rerender } = render(<Banner status="offline" text="Offline" />);
    expect(screen.getByRole('status').textContent).toBe('Offline');
    expect(screen.queryByRole('button')).toBeNull();
    rerender(<Banner status="reconnecting" text="Reconnecting" actionLabel="Try now" onAction={onAction} />);
    fireEvent.click(screen.getByRole('button', { name: 'Try now' }));
    expect(onAction).toHaveBeenCalledOnce();
  });
});

describe('Dialog', () => {
  it('renders title and close button, and closes', () => {
    const onOpenChange = vi.fn();
    render(
      <Dialog open onOpenChange={onOpenChange} title="Add people" closeLabel="Close">
        body
      </Dialog>,
    );
    expect(screen.getByRole('dialog', { name: 'Add people' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('Menu', () => {
  it('shows items and segmented radio choices', async () => {
    const onValueChange = vi.fn();
    render(
      <Menu defaultOpen>
        <MenuTrigger>Me</MenuTrigger>
        <MenuContent>
          <MenuSegments
            label="Language"
            value="en"
            onValueChange={onValueChange}
            options={[
              { value: 'en', label: 'English', lang: 'en' },
              { value: 'ja', label: '日本語', lang: 'ja' },
            ]}
          />
          <MenuItem>Sign out</MenuItem>
        </MenuContent>
      </Menu>,
    );
    await act(async () => {});
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeTruthy();
    expect(screen.getByRole('menuitemradio', { name: 'English' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('menuitemradio', { name: '日本語' }));
    expect(onValueChange).toHaveBeenCalledWith('ja');
  });
});
