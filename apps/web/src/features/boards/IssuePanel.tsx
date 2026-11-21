// The issue panel (BoardsIssue, BoardsAssignee, BoardsDue): beside the board like a thread. Title, column, assignee and
// due are one click each; comments go through the store's thread API on the project room, with change one-liners between.
import * as DM from '@radix-ui/react-dropdown-menu';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { DeleteConfirm } from '../../app/composer/DeleteConfirm';
import { ComposerProvider, useComposer } from '../../app/composer/context';
import { Composer } from '../../app/composer/lazy';
import { lazyComponent } from '../../app/lazy';
import { TimelineContext, type TimelineActions } from '../../app/timeline/context';
import { MessageRow } from '../../app/timeline/MessageRow';
import { PlainText, RichText } from '../../app/timeline/RichText';
import { useDocsBoards, useStore, useWorkspace, type Issue, type IssueChange, type Message, type Person, type Project } from '../../matrix';
import { isImeEnter } from '../../ui';
import { copyText, useAssignable } from './CardMenu';
import { CalendarIcon, CheckIcon, CloseIcon, ColumnIcon, LinkIcon, MoreIcon } from './icons';
import { PanelPeers, TypingLine, usePanelLive } from './Live';
import { isLate, issueKey, useColumnName } from './model';
import { useDueText, useTranslated, useWhen, Who, type Translator } from './parts';
import { AssigneePicker, DuePicker } from './Pickers';
import s from './Boards.module.css';
import { useT } from './strings';

function StaticDescription({ value }: { value?: { body: string; html?: string } }) {
  if (!value?.body) return null;
  return value.html ? <RichText html={value.html} /> : <PlainText text={value.body} />;
}

const DescriptionEditor = lazyComponent(
  () => import('./Description').then((m) => m.DescriptionEditor),
  (p) => <StaticDescription value={p.value} />,
);

type Props = { project: Project; issue: Issue; translator: Translator | null; onClose: () => void; onDelete: () => void };

export function IssuePanel(props: Props) {
  return (
    <ComposerProvider>
      <Panel {...props} />
    </ComposerProvider>
  );
}

function Panel({ project, issue, translator, onClose, onDelete }: Props) {
  const t = useT();
  const store = useStore();
  const key = issueKey(project, issue);
  const liveRef = usePanelLive(project.id, issue.id);

  const close = useRef(onClose);
  useLayoutEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]')) return;
      close.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    store.openThread(project.id, issue.id);
    store.markThreadRead(project.id, issue.id);
  }, [store, project.id, issue.id]);

  return (
    <aside ref={liveRef} className={s.panel} aria-label={key}>
      <header className={s.panelHead}>
        <span className={s.panelKey}>{key}</span>
        <span className={s.spacer} />
        <PanelPeers projectId={project.id} issueId={issue.id} />
        <button type="button" className={s.panelTool} aria-label={t('copyLink')} onClick={() => void copyText(store.docsBoards.issueLink(project.id, issue.id)).catch(() => {})}>
          <LinkIcon />
        </button>
        <DM.Root modal={false}>
          <DM.Trigger asChild>
            <button type="button" className={s.panelTool} aria-label={t('more')}>
              <MoreIcon size={17} strokeWidth={1.9} />
            </button>
          </DM.Trigger>
          <DM.Portal>
            <DM.Content className={s.menu} align="end" sideOffset={4} collisionPadding={12}>
              <DM.Item className={`${s.opt} ${s.optDanger}`} onSelect={onDelete}>
                <span>{t('delete')}</span>
              </DM.Item>
            </DM.Content>
          </DM.Portal>
        </DM.Root>
        <button type="button" className={s.panelTool} aria-label={t('close')} onClick={onClose}>
          <CloseIcon />
        </button>
      </header>
      <div className={s.panelBody}>
        <Title project={project} issue={issue} translator={translator} />
        <Props project={project} issue={issue} />
        <Description project={project} issue={issue} translator={translator} />
        <h3 className={s.activityTitle}>{t('activity')}</h3>
        <Activity project={project} issue={issue} />
      </div>
      <TypingLine projectId={project.id} issueId={issue.id} />
      <CommentBox project={project} issue={issue} />
    </aside>
  );
}

function TranslateLine({ tr, translator }: { tr: ReturnType<typeof useTranslated>; translator: Translator }) {
  if (tr.phase === 'failed') {
    return (
      <div className={s.trLine}>
        <span className={`${s.trGlyph} ${s.trFailed}`}>{translator.icon}</span>
        <span className={s.trFailed}>{translator.labels.failed}</span>
        <button type="button" className={s.textLink} onClick={tr.retry}>
          {translator.labels.retry}
        </button>
      </div>
    );
  }
  if (tr.phase !== 'translated') return null;
  return (
    <div className={s.trLine}>
      <span className={s.trGlyph}>{translator.icon}</span>
      <button type="button" className={s.textLink} onClick={tr.toggle}>
        {translator.labels.showOriginal}
      </button>
    </div>
  );
}

function TranslateButton({ tr, translator }: { tr: ReturnType<typeof useTranslated>; translator: Translator }) {
  if (!tr.offered || tr.phase === 'translated' || tr.phase === 'translating') return null;
  return (
    <button type="button" className={`${s.tool} ${s.translateCorner}`} aria-label={translator.labels.translate} onClick={tr.toggle}>
      {translator.icon}
    </button>
  );
}

function Title({ project, issue, translator }: { project: Project; issue: Issue; translator: Translator | null }) {
  const t = useT();
  const store = useStore();
  const [draft, setDraft] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const tr = useTranslated(translator, `${issue.id}:title`, issue.title);
  const value = draft ?? issue.title;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [value, tr.phase]);
  const save = () => {
    const next = draft?.trim();
    setDraft(null);
    if (next && next !== issue.title) void store.docsBoards.updateIssue(project.id, issue.id, { title: next }).catch(() => {});
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (isImeEnter(e)) {
      e.preventDefault();
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setDraft(null);
      e.currentTarget.blur();
    }
  };
  if (tr.phase === 'translated') {
    return (
      <div className={s.titleWrap}>
        <h2 className={s.titleField}>{tr.text ?? issue.title}</h2>
        {translator && <TranslateLine tr={tr} translator={translator} />}
      </div>
    );
  }
  return (
    <div className={s.titleWrap}>
      <textarea
        ref={ref}
        rows={1}
        className={[s.titleField, tr.phase === 'translating' && s.translating].filter(Boolean).join(' ')}
        aria-label={t('titleField')}
        value={value}
        onChange={(e) => setDraft(e.target.value.replace(/\n/g, ' '))}
        onBlur={save}
        onKeyDown={onKeyDown}
      />
      {translator && <TranslateButton tr={tr} translator={translator} />}
      {translator && <TranslateLine tr={tr} translator={translator} />}
    </div>
  );
}

function Props({ project, issue }: { project: Project; issue: Issue }) {
  const t = useT();
  const store = useStore();
  const name = useColumnName();
  const due = useDueText();
  const [picker, setPicker] = useState<'assignee' | 'due' | null>(null);
  const people = useAssignable(project.spaceId);
  const column = project.columns.find((c) => c.id === issue.column);
  const update = (patch: Parameters<typeof store.docsBoards.updateIssue>[2]) => void store.docsBoards.updateIssue(project.id, issue.id, patch).catch(() => {});
  const move = (to: string) => {
    if (to !== issue.column) void store.docsBoards.moveIssue(project.id, issue.id, { column: to }).catch(() => {});
  };
  return (
    <div className={s.props}>
      <span className={s.propLabel}>{t('status')}</span>
      <DM.Root modal={false}>
        <DM.Trigger asChild>
          <button type="button" className={s.prop}>
            <ColumnIcon id={issue.column} />
            {column ? name(column) : issue.column}
          </button>
        </DM.Trigger>
        <DM.Portal>
          <DM.Content className={`${s.menu} ${s.subMenu}`} align="start" sideOffset={4} collisionPadding={12}>
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
          </DM.Content>
        </DM.Portal>
      </DM.Root>
      <span className={s.propLabel}>{t('assignee')}</span>
      <button type="button" className={s.prop} data-picker aria-expanded={picker === 'assignee'} onClick={() => setPicker(picker === 'assignee' ? null : 'assignee')}>
        <Who person={issue.assignee} />
        {issue.assignee?.name ?? t('nobody')}
      </button>
      <span className={s.propLabel}>{t('due')}</span>
      <button type="button" className={[s.prop, isLate(issue) && s.late].filter(Boolean).join(' ')} data-picker aria-expanded={picker === 'due'} onClick={() => setPicker(picker === 'due' ? null : 'due')}>
        <span className={s.chipIcon}>
          <CalendarIcon size={15} />
        </span>
        {issue.due ? due.long(issue.due) : t('noDue')}
      </button>
      <span className={s.propLabel}>{t('project')}</span>
      <span className={`${s.prop} ${s.propStatic}`}>
        <span className={s.swatch} style={{ background: project.colour, boxShadow: 'none' }} />
        {project.name}
      </span>
      {picker === 'assignee' && (
        <AssigneePicker people={people} value={issue.assignee?.id} onPick={(id) => (id ?? null) !== (issue.assignee?.id ?? null) && update({ assignee: id })} onClose={() => setPicker(null)} style={{ left: 98, top: 70 }} />
      )}
      {picker === 'due' && <DuePicker value={issue.due} onPick={(d) => d !== (issue.due ?? null) && update({ due: d })} onClose={() => setPicker(null)} style={{ left: 98, top: 104 }} />}
    </div>
  );
}

function Description({ project, issue, translator }: { project: Project; issue: Issue; translator: Translator | null }) {
  const t = useT();
  const store = useStore();
  const value = useDocsBoards(() => store.docsBoards.description(project.id, issue.id));
  const people = useAssignable(project.spaceId);
  const tr = useTranslated(translator, `${issue.id}:desc`, value?.body ?? '', value?.html);
  return (
    <div className={s.descWrap}>
      <div className={[s.desc, tr.phase === 'translating' && s.translating].filter(Boolean).join(' ')}>
        {tr.phase === 'translated' ? (
          <StaticDescription value={tr.html ? { body: tr.text ?? '', html: tr.html } : { body: tr.text ?? value?.body ?? '' }} />
        ) : (
          <DescriptionEditor
            key={issue.id}
            value={value}
            people={people ?? []}
            label={t('description')}
            mentionLabel={t('mentionList')}
            emojiLabel={t('emojiList')}
            onSave={(d) => void store.docsBoards.setDescription(project.id, issue.id, d).catch(() => {})}
          />
        )}
      </div>
      {translator && <TranslateButton tr={tr} translator={translator} />}
      {translator && <TranslateLine tr={tr} translator={translator} />}
    </div>
  );
}

type Item = { kind: 'created'; ts: number; by: Person } | { kind: 'change'; ts: number; change: IssueChange } | { kind: 'comment'; ts: number; message: Message };

const noMessages: Message[] = [];

function Activity({ project, issue }: { project: Project; issue: Issue }) {
  const t = useT();
  const store = useStore();
  const composer = useComposer();
  const name = useColumnName();
  const due = useDueText();
  const when = useWhen();
  const meId = useWorkspace((x) => x.me.id);
  const messages = useWorkspace((x) => x.threadTimelines[issue.id]?.messages ?? noMessages);
  const people = useAssignable(project.spaceId);
  const [changes, setChanges] = useState<{ of: string; list: IssueChange[] }>();
  const [deleting, setDeleting] = useState<Message[] | null>(null);
  const expanded = useRef(new Set<string>());

  useEffect(() => {
    let live = true;
    store.docsBoards.issueChanges(project.id, issue.id).then(
      (list) => live && setChanges({ of: issue.id, list }),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [store, project.id, issue.id, issue.column, issue.assignee?.id, issue.due, issue.title]);

  const actions = useMemo<TimelineActions>(
    () => ({
      channelId: project.id,
      meId,
      openViewer: () => {},
      askDelete: setDeleting,
      linkCopied: () => {},
      jumpTo: () => {},
      isExpanded: (id) => expanded.current.has(id),
      expand: (id) => void expanded.current.add(id),
    }),
    [project.id, meId],
  );

  const root = messages[0]?.id === issue.id ? messages[0] : undefined;
  const items: Item[] = [
    ...(root ? [{ kind: 'created' as const, ts: root.ts, by: root.sender }] : []),
    ...(changes?.of === issue.id ? changes.list.map((change) => ({ kind: 'change' as const, ts: change.ts, change })) : []),
    ...messages.filter((m) => m.id !== issue.id).map((message) => ({ kind: 'comment' as const, ts: message.ts, message })),
  ].sort((a, b) => a.ts - b.ts);

  const personName = (id?: string) => (id ? (people?.find((p) => p.id === id)?.name ?? (issue.assignee?.id === id ? issue.assignee.name : id)) : '');
  const describe = (c: IssueChange): string => {
    const by = c.by.name;
    if (c.field === 'column') {
      const col = project.columns.find((x) => x.id === c.to);
      return t('movedTo', { name: by, column: col ? name(col) : (c.to ?? '') });
    }
    if (c.field === 'assignee') return c.to ? t('assignedTo', { name: by, person: personName(c.to) }) : t('unassigned', { name: by });
    if (c.field === 'due') return c.to ? t('dueSet', { name: by, date: due.short(c.to) }) : t('dueCleared', { name: by });
    return t('renamed', { name: by, title: c.to ?? '' });
  };
  const line = (key: string, text: string, ts: number): ReactNode => (
    <div key={key} className={s.change}>
      <span aria-hidden="true" className={s.changeDot} />
      <span>{t('oneLine', { text, when: when(ts) })}</span>
    </div>
  );

  return (
    <TimelineContext.Provider value={actions}>
      {items.map((it, i) => {
        if (it.kind === 'created') return line('created', t('created', { name: it.by.name }), it.ts);
        if (it.kind === 'change') return line(it.change.id, describe(it.change), it.ts);
        const prev = items[i - 1];
        const head = !(prev?.kind === 'comment' && prev.message.sender.id === it.message.sender.id && it.ts - prev.ts < 5 * 60_000);
        return (
          <div key={it.message.id} className={s.comment}>
            <MessageRow
              message={it.message}
              head={head}
              compact
              meId={meId}
              editing={composer.editingId === it.message.id}
              onEditDone={composer.stopEdit}
              onRetry={(id) => store.retry(project.id, id)}
              onDiscard={(id) => store.discard(project.id, id)}
            />
          </div>
        );
      })}
      {deleting && (
        <DeleteConfirm
          message={deleting[0]!}
          open
          onCancel={() => setDeleting(null)}
          onDelete={() => {
            for (const m of deleting) store.remove(project.id, m.id);
            setDeleting(null);
          }}
        />
      )}
    </TimelineContext.Provider>
  );
}

function CommentBox({ project, issue }: { project: Project; issue: Issue }) {
  const t = useT();
  return (
    <div className={s.commentDock}>
      <Composer channelId={project.id} channelName={project.name} threadRootId={issue.id} placeholder={t('comment')} />
    </div>
  );
}
