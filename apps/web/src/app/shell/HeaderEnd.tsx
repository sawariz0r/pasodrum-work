// The right end of every page header: the registry's header button (the Assistant's spark), or nothing.
import { platform } from '../../platform';
import { AttentionDot, IconButton } from '../../ui';
import { useRegistry } from '../RegistryProvider';
import s from './HeaderEnd.module.css';

/** `afterSearch`: placed right after the header search button, which already sits at the end (not in the desktop app). */
export function HeaderEnd({ afterSearch = false }: { afterSearch?: boolean }) {
  const assistant = useRegistry().assistant;
  // The registry is fixed for the app's life, so this hook runs on every render or never.
  const button = assistant?.useHeaderButton() ?? null;
  if (!button) return null;
  return (
    <IconButton
      className={[s.end, afterSearch && !platform.desktop && s.beside].filter(Boolean).join(' ')}
      label={button.label}
      aria-pressed={button.pressed}
      icon={
        <>
          {button.icon}
          {button.dot && <AttentionDot className={s.dot} />}
        </>
      }
      onClick={button.run}
    />
  );
}
