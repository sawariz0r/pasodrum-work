import { Trans, useTranslation } from 'react-i18next';
import { useWorkspace } from '../../matrix';
import { formatList } from '../format';
import s from './Timeline.module.css';

/** Sits in the space the composer reserves above itself; appears and goes without motion. */
export function TypingIndicator({ channelId }: { channelId: string }) {
  const { t } = useTranslation();
  const typing = useWorkspace((snap) => snap.typing[channelId]);
  if (!typing?.length) return null;
  return (
    <div className={s.typing} role="status">
      <span className={s.typingDots} aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span>
        {typing.length === 1 ? (
          <Trans i18nKey="timeline.typing" values={{ name: typing[0]!.name }} components={{ b: <strong /> }} />
        ) : (
          <Trans i18nKey="timeline.typingMany" values={{ names: formatList(typing.map((p) => t('timeline.person', { name: p.name }))) }} components={{ b: <strong /> }} />
        )}
      </span>
    </div>
  );
}
