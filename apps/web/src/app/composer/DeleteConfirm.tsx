// Delete confirm (MsgDeleteConfirm board): the message preview, Cancel, Delete.
import { useTranslation } from 'react-i18next';
import type { Message } from '../../matrix';
import { Button, Dialog } from '../../ui';
import { formatTime } from '../format';
import s from './MessageEditor.module.css';
import { PersonAvatar } from '../timeline/PersonAvatar';

export function DeleteConfirm({ message, open, onCancel, onDelete }: { message: Message; open: boolean; onCancel: () => void; onDelete: () => void }) {
  const { t } = useTranslation();
  const date = new Date(message.ts);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onCancel()}
      title={t('composer.deleteTitle')}
      closeLabel={t('composer.close')}
      width={440}
      top={168}
      role="alertdialog"
      footer={
        <div className={s.confirmActions}>
          <Button variant="secondary" onClick={onCancel}>
            {t('composer.cancel')}
          </Button>
          <Button variant="danger" onClick={onDelete}>
            {t('composer.delete')}
          </Button>
        </div>
      }
    >
      <div className={s.preview}>
        <PersonAvatar size={30} person={message.sender} />
        <span className={s.previewMain}>
          <span className={s.previewMeta}>
            <span className={s.previewName}>{message.sender.name}</span>
            <time className={s.previewTime} dateTime={date.toISOString()}>
              {formatTime(date)}
            </time>
          </span>
          <span className={s.previewText}>{message.body || message.media?.name}</span>
        </span>
      </div>
    </Dialog>
  );
}
