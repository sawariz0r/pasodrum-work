// Card menu (BoardsCardMenu): Open, Move to (columns), Assign, Copy link, Delete. Also the keyboard way to move.
import * as DM from '@radix-ui/react-dropdown-menu';
import { useEffect, useState, type ReactNode } from 'react';
import { useToast } from '../../app/toast';
import { useStore, type Issue, type Person, type Project } from '../../matrix';
import { CheckIcon, ChevronRightIcon, ColumnIcon } from './icons';
import { issueKey, useColumnName } from './model';
import { Who } from './parts';
import s from './Boards.module.css';
import { useT } from './strings';

export function copyText(text: string) {
  return navigator.clipboard?.writeText(text) ?? Promise.reject(new Error('no clipboard'));
}

const memberCache = new Map<string, Promise<Person[]>>();

/** People who can be assigned in a space (clients too). Fetched once per space per page load. */
export function useAssignable(spaceId: string, enabled = true): Person[] | undefined {
  const store = useStore();
  const [people, setPeople] = useState<{ spaceId: string; list: Person[] }>();
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    let p = memberCache.get(spaceId);
    if (!p) {
      p = store.spaceMembers(spaceId).then((m) => m.filter((x) => !x.pending).map((x) => x.person));
      p.catch(() => memberCache.delete(spaceId));
      memberCache.set(spaceId, p);
    }
    p.then((list) => live && setPeople({ spaceId, list }), () => {});
    return () => {
      live = false;
    };
  }, [store, spaceId, enabled]);
  return people?.spaceId === spaceId ? people.list : undefined;
}

type Props = {
  project: Project;
  issue: Issue;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenIssue: () => void;
  onDelete: () => void;
  trigger: ReactNode;
};

export function CardMenu({ project, issue, open, onOpenChange, onOpenIssue, onDelete, trigger }: Props) {
  const t = useT();
  const store = useStore();
  const toast = useToast();
  const name = useColumnName();
  const people = useAssignable(project.spaceId, open);
  const key = issueKey(project, issue);
  const move = (column: string) => {
    if (column === issue.column) return;
    store.docsBoards.moveIssue(project.id, issue.id, { column }).catch(() => toast(t('couldntMove', { key })));
  };
  const assign = (id: string | null) => {
    if ((issue.assignee?.id ?? null) === id) return;
    void store.docsBoards.updateIssue(project.id, issue.id, { assignee: id }).catch(() => {});
  };

  return (
    <DM.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <DM.Trigger asChild>{trigger}</DM.Trigger>
      <DM.Portal>
        <DM.Content className={s.menu} align="start" sideOffset={4} collisionPadding={12} aria-label={key} onClick={(e) => e.stopPropagation()}>
          <DM.Item className={s.opt} onSelect={onOpenIssue}>
            <span>{t('open')}</span>
          </DM.Item>
          <DM.Sub>
            <DM.SubTrigger className={s.opt}>
              <span>{t('moveTo')}</span>
              <span className={s.optEnd}>
                <ChevronRightIcon />
              </span>
            </DM.SubTrigger>
            <DM.Portal>
              <DM.SubContent className={`${s.menu} ${s.subMenu}`} sideOffset={4} collisionPadding={12}>
                <DM.RadioGroup value={issue.column} onValueChange={move}>
                  {project.columns.map((c) => (
                    <DM.RadioItem key={c.id} value={c.id} className={s.opt}>
                      <ColumnIcon id={c.id} />
                      <span>{name(c)}</span>
                      <DM.ItemIndicator className={s.optCheck}>
                        <CheckIcon />
                      </DM.ItemIndicator>
                    </DM.RadioItem>
                  ))}
                </DM.RadioGroup>
              </DM.SubContent>
            </DM.Portal>
          </DM.Sub>
          <DM.Sub>
            <DM.SubTrigger className={s.opt}>
              <span>{t('assign')}</span>
              <span className={s.optEnd}>
                <ChevronRightIcon />
              </span>
            </DM.SubTrigger>
            <DM.Portal>
              <DM.SubContent className={`${s.menu} ${s.subMenu}`} sideOffset={4} collisionPadding={12}>
                <DM.RadioGroup value={issue.assignee?.id ?? ''} onValueChange={(v) => assign(v || null)}>
                  <DM.RadioItem value="" className={s.opt}>
                    <Who />
                    <span>{t('nobody')}</span>
                    <DM.ItemIndicator className={s.optCheck}>
                      <CheckIcon />
                    </DM.ItemIndicator>
                  </DM.RadioItem>
                  {(people ?? (issue.assignee ? [issue.assignee] : [])).map((p) => (
                    <DM.RadioItem key={p.id} value={p.id} className={s.opt}>
                      <Who person={p} />
                      <span>{p.name}</span>
                      <DM.ItemIndicator className={s.optCheck}>
                        <CheckIcon />
                      </DM.ItemIndicator>
                    </DM.RadioItem>
                  ))}
                </DM.RadioGroup>
              </DM.SubContent>
            </DM.Portal>
          </DM.Sub>
          <DM.Item className={s.opt} onSelect={() => void copyText(store.docsBoards.issueLink(project.id, issue.id)).catch(() => {})}>
            <span>{t('copyLink')}</span>
          </DM.Item>
          <DM.Separator className={s.sep} />
          <DM.Item className={`${s.opt} ${s.optDanger}`} onSelect={onDelete}>
            <span>{t('delete')}</span>
          </DM.Item>
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}
