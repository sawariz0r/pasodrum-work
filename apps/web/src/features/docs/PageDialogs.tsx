// Move to (DocsMoveTo): the same space only, the current place greyed. Delete (DocsDeletePage): asks once; the subtree goes too.
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useToast } from '../../app/toast';
import { useDocsBoards, useStore, useWorkspace, type PageNode } from '../../matrix';
import { Button, Dialog } from '../../ui';
import { Check, PageIcon, SpaceRoot } from './icons';
import { contains, flatten } from './model';
import { useT } from './strings';
import s from './Docs.module.css';

const ROOT = '';

export function MoveDialog({ open, node, parent, onClose }: { open: boolean; node: PageNode; parent?: string; onClose: () => void }) {
  const t = useT();
  const store = useStore();
  const toast = useToast();
  const space = useWorkspace((x) => x.spaces.find((sp) => sp.id === node.spaceId));
  const roots = useDocsBoards((x) => x.pages[node.spaceId]?.roots);
  const [choice, setChoice] = useState<string | null>(null);
  const title = node.title || t('untitled');
  const here = parent ?? ROOT;
  const options = [{ id: ROOT, title: space?.name ?? '', depth: -1 }, ...flatten(roots ?? []).filter((x) => !contains(node, x.node.id)).map((x) => ({ id: x.node.id, title: x.node.title || t('untitled'), depth: x.depth }))];

  const close = () => {
    setChoice(null);
    onClose();
  };
  const move = () => {
    if (choice === null) return;
    close();
    store.docsBoards.movePage(node.id, choice === ROOT ? {} : { parent: choice }).catch(() => toast(t('moveFailed', { title })));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && close()}
      title={t('moveTitle', { title })}
      closeLabel={t('close')}
      width={440}
      top={140}
      bodyClassName={s.dialogBody}
      footer={
        <div className={s.dialogActions}>
          <Button variant="secondary" onClick={close}>
            {t('cancel')}
          </Button>
          <Button disabled={choice === null} onClick={move}>
            {t('move')}
          </Button>
        </div>
      }
    >
      <div role="radiogroup" aria-label={t('moveTo')} className={s.destinations}>
        {options.map((o) => {
          const current = o.id === here;
          const checked = o.id === choice;
          return (
            <button
              key={o.id || 'root'}
              type="button"
              role="radio"
              aria-checked={checked}
              disabled={current}
              className={s.destination}
              style={{ paddingLeft: 10 + Math.max(0, o.depth) * 18 }}
              onClick={() => setChoice(o.id)}
            >
              <span className={s.destIcon}>{o.depth < 0 ? <SpaceRoot /> : <PageIcon />}</span>
              <span className={s.destName}>{o.title}</span>
              {checked && (
                <span className={s.destCheck}>
                  <Check />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </Dialog>
  );
}

export function DeleteDialog({ open, node, onClose }: { open: boolean; node: PageNode; onClose: () => void }) {
  const t = useT();
  const store = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const title = node.title || t('untitled');
  const remove = () => {
    onClose();
    navigate('/docs', { replace: true });
    store.docsBoards.deletePage(node.id).catch(() => toast(t('deleteFailed', { title })));
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t('deleteTitle', { title })}
      closeLabel={t('close')}
      width={440}
      top={140}
      role="alertdialog"
      bodyClassName={s.dialogBody}
      footer={
        <div className={s.dialogActions}>
          <Button variant="secondary" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button variant="danger" onClick={remove}>
            {t('delete')}
          </Button>
        </div>
      }
    >
      <div className={s.deleteBox}>
        <span className={s.deleteIcon}>
          <PageIcon size={18} />
        </span>
        <span className={s.deleteName}>{title}</span>
      </div>
    </Dialog>
  );
}
