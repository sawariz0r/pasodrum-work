// TipTap and the emoji picker load on first use (M8). The composer and the inline editor share one chunk (./editors).
import type { ComponentProps } from 'react';
import { lazyComponent } from '../lazy';
import type * as Editors from './editors';
import type * as Picker from './EmojiPicker';
import s from './Composer.module.css';

const editors = () => import('./editors');

/** The empty composer card (as in AppStart) at the composer's own height, so the timeline doesn't shift when it loads. */
function ComposerSkeleton({ thread }: { thread: boolean }) {
  return (
    <div className={thread ? `${s.dock} ${s.threadDock}` : s.dock} aria-hidden="true">
      <div className={`${s.box} ${s.skeleton}`} />
    </div>
  );
}

export const Composer = lazyComponent<ComponentProps<typeof Editors.Composer>>(
  () => editors().then((m) => m.Composer),
  (props) => <ComposerSkeleton thread={!!props.threadRootId} />,
);

export const MessageEditor = lazyComponent<ComponentProps<typeof Editors.MessageEditor>>(() => editors().then((m) => m.MessageEditor));

export const EmojiPicker = lazyComponent<ComponentProps<typeof Picker.EmojiPicker>>(() => import('./EmojiPicker').then((m) => m.EmojiPicker));
