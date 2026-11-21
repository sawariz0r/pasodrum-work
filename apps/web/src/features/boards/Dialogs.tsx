// BoardsNewIssue, BoardsCreateFailed, BoardsNewProject, BoardsColumn (also Rename column), BoardsDeleteIssue.
import * as RD from '@radix-ui/react-dialog';
import * as DM from '@radix-ui/react-dropdown-menu';
import { useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import { useStore, type Column, type Issue, type Project } from '../../matrix';
import { Button, Dialog, IconButton, isImeEnter } from '../../ui';
import { AlertIcon } from '../../ui/icons';
import { useAssignable } from './CardMenu';
import { CalendarIcon, CheckIcon, CloseIcon, ColumnIcon, PersonIcon } from './icons';
import { boardsPath, issueKey, useColumnName, useDefaultColumns } from './model';
import { useDueText, Who } from './parts';
import { AssigneePicker, DuePicker } from './Pickers';
import s from './Boards.module.css';
import { useT } from './strings';

type NewIssueProps = { projects: Project[]; projectId: string; onClose: () => void };

export function NewIssueDialog({ projects, projectId, onClose }: NewIssueProps) {
  const t = useT();
  const store = useStore();
  const name = useColumnName();
  const due = useDueText();
  const [pid, setPid] = useState(projectId);
  const project = projects.find((p) => p.id === pid) ?? projects[0];
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [column, setColumn] = useState(project?.columns[0]?.id ?? 'todo');
  const [assignee, setAssignee] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [picker, setPicker] = useState<'assignee' | 'due' | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const people = useAssignable(project?.spaceId ?? '', !!project);
  if (!project) return null;
  const col = project.columns.find((c) => c.id === column) ?? project.columns[0];
  const person = people?.find((p) => p.id === assignee);

  const create = () => {
    const text = title.trim();
    if (!text || busy || !col) return;
    setBusy(true);
    setFailed(false);
    store.docsBoards
      .createIssue(project.id, { title: text, column: col.id, ...(assignee ? { assignee } : {}), ...(day ? { due: day } : {}) })
      .then((id) => {
        if (description.trim()) void store.docsBoards.setDescription(project.id, id, { body: description.trim() }).catch(() => {});
        onClose();
      })
      .catch(() => {
        setBusy(false);
        setFailed(true);
      });
  };
  const onTitleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!isImeEnter(e)) return;
    e.preventDefault();
    create();
  };
  const switchProject = (id: string) => {
    setPid(id);
    const next = projects.find((p) => p.id === id);
    if (next && !next.columns.some((c) => c.id === column)) setColumn(next.columns[0]?.id ?? 'todo');
    if (next?.spaceId !== project.spaceId) setAssignee(null);
  };

  return (
    <RD.Root open onOpenChange={(o) => !o && onClose()}>
      <RD.Portal>
        <RD.Overlay className={s.overlay}>
          <RD.Content className={s.dialog} aria-describedby={undefined} aria-busy={busy || undefined}>
            <RD.Title className={s.srOnly}>
              {t('newIssue')}
            </RD.Title>
            <div className={s.dialogTop}>
              <DM.Root modal={false}>
                <DM.Trigger asChild>
                  <button type="button" className={s.chip}>
                    <span className={s.chipSwatch} style={{ background: project.colour }} />
                    {project.name}
                  </button>
                </DM.Trigger>
                <DM.Portal>
                  <DM.Content className={s.menu} align="start" sideOffset={4} style={{ zIndex: 40, width: 240 }}>
                    <DM.RadioGroup value={project.id} onValueChange={switchProject}>
                      {projects.map((p) => (
                        <DM.RadioItem key={p.id} value={p.id} className={s.opt}>
                          <span className={s.chipSwatch} style={{ background: p.colour }} />
                          <span>{p.name}</span>
                          <DM.ItemIndicator className={s.optCheck}>
                            <CheckIcon />
                          </DM.ItemIndicator>
                        </DM.RadioItem>
                      ))}
                    </DM.RadioGroup>
                  </DM.Content>
                </DM.Portal>
              </DM.Root>
              <span className={s.spacer} />
              <RD.Close asChild>
                <IconButton size={30} label={t('close')} icon={<CloseIcon />} />
              </RD.Close>
            </div>
            <div className={s.dialogBody}>
              <input className={s.bigTitle} aria-label={t('titleField')} placeholder={t('titleField')} value={title} autoFocus onChange={(e) => setTitle(e.target.value)} onKeyDown={onTitleKey} />
              <textarea className={s.descField} aria-label={t('description')} placeholder={t('description')} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className={s.chips}>
              <DM.Root modal={false}>
                <DM.Trigger asChild>
                  <button type="button" className={s.chip}>
                    {col && <ColumnIcon id={col.id} />}
                    {col && name(col)}
                  </button>
                </DM.Trigger>
                <DM.Portal>
                  <DM.Content className={`${s.menu} ${s.subMenu}`} align="start" sideOffset={4} style={{ zIndex: 40 }}>
                    <DM.RadioGroup value={col?.id} onValueChange={setColumn}>
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
              <span className={s.chipAnchor}>
                <button type="button" className={s.chip} data-picker aria-expanded={picker === 'assignee'} onClick={() => setPicker(picker === 'assignee' ? null : 'assignee')}>
                  {person ? (
                    <>
                      <Who person={person} />
                      {person.name}
                    </>
                  ) : (
                    <>
                      <span className={s.chipIcon}>
                        <PersonIcon size={14} strokeWidth={2} />
                      </span>
                      {t('assignee')}
                    </>
                  )}
                </button>
                {picker === 'assignee' && <AssigneePicker people={people} value={assignee ?? undefined} onPick={setAssignee} onClose={() => setPicker(null)} style={{ left: 0, top: 36 }} />}
              </span>
              <span className={s.chipAnchor}>
                <button type="button" className={s.chip} data-picker aria-expanded={picker === 'due'} onClick={() => setPicker(picker === 'due' ? null : 'due')}>
                  <span className={s.chipIcon}>
                    <CalendarIcon size={14} />
                  </span>
                  {day ? due.long(day) : t('due')}
                </button>
                {picker === 'due' && <DuePicker value={day ?? undefined} onPick={setDay} onClose={() => setPicker(null)} style={{ left: 0, top: 36 }} />}
              </span>
            </div>
            {failed && (
              <div role="alert" className={s.alert}>
                <AlertIcon size={15} strokeWidth={2.2} />
                <span>{t('couldntCreate')}</span>
              </div>
            )}
            <div className={s.dialogFoot}>
              <Button variant="secondary" onClick={onClose}>
                {t('cancel')}
              </Button>
              <Button onClick={create} disabled={!title.trim() || busy}>
                {t('create')}
              </Button>
            </div>
          </RD.Content>
        </RD.Overlay>
      </RD.Portal>
    </RD.Root>
  );
}

const swatches = [
  ['#0F766E', 'sw_teal'],
  ['#B45309', 'sw_amber'],
  ['#6D28D9', 'sw_violet'],
  ['#2F4A6D', 'sw_navy'],
  ['#BE123C', 'sw_rose'],
  ['#1D4ED8', 'sw_blue'],
  ['#4D7C0F', 'sw_green'],
  ['#64748B', 'sw_slate'],
] as const;

export function NewProjectDialog({ spaceId, onClose }: { spaceId: string; onClose: () => void }) {
  const t = useT();
  const store = useStore();
  const navigate = useNavigate();
  const defaultColumns = useDefaultColumns();
  const [name, setName] = useState('');
  const [colour, setColour] = useState<string>(swatches[0][0]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const create = () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    setFailed(false);
    store.docsBoards.createProject({ spaceId, name: name.trim(), colour, columns: defaultColumns() }).then(
      (id) => {
        onClose();
        navigate(boardsPath(id));
      },
      () => {
        setBusy(false);
        setFailed(true);
      },
    );
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('newProject')}
      width={440}
      top={120}
      busy={busy}
      alert={failed ? t('couldntCreateProject') : undefined}
      footer={
        <div className={s.footEnd}>
          <Button variant="secondary" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button onClick={create} disabled={!name.trim() || busy}>
            {t('createProject')}
          </Button>
        </div>
      }
    >
      <div className={s.form}>
        <label>
          <span className={s.label}>{t('name')}</span>
          <input
            className={s.field}
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (!isImeEnter(e)) return;
              e.preventDefault();
              create();
            }}
          />
        </label>
        <div role="radiogroup" aria-labelledby="boards-colour">
          <span id="boards-colour" className={s.label}>
            {t('colour')}
          </span>
          <div className={s.swatches}>
            {swatches.map(([hex, key]) => (
              <label key={hex} className={s.sw} title={t(key)}>
                <input type="radio" name="boards-colour" aria-label={t(key)} checked={colour === hex} onChange={() => setColour(hex)} />
                <span style={{ background: hex }} />
              </label>
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  );
}

/** New column, or Rename when `column` is given: one title, as typed. */
export function ColumnDialog({ project, column, onClose }: { project: Project; column?: Column; onClose: () => void }) {
  const t = useT();
  const store = useStore();
  const name = useColumnName();
  const before = column ? name(column) : '';
  const [title, setTitle] = useState(column ? before : '');
  const [busy, setBusy] = useState(false);
  const ready = !!title.trim() && !busy && (!column || title.trim() !== before);
  const save = () => {
    if (!ready) return;
    setBusy(true);
    const clean = title.trim();
    (column ? store.docsBoards.renameColumn(project.id, column.id, clean) : store.docsBoards.createColumn(project.id, clean)).then(onClose, () => setBusy(false));
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t(column ? 'renameColumn' : 'newColumn')}
      width={440}
      top={120}
      busy={busy}
      footer={
        <div className={s.footEnd}>
          <Button variant="secondary" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button onClick={save} disabled={!ready}>
            {t(column ? 'save' : 'addColumn')}
          </Button>
        </div>
      }
    >
      <label>
        <span className={s.label}>{t('titleField')}</span>
        <input
          className={s.field}
          value={title}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (!isImeEnter(e)) return;
            e.preventDefault();
            save();
          }}
        />
      </label>
    </Dialog>
  );
}

export function DeleteIssueDialog({ project, issue, onClose, onDeleted }: { project: Project; issue: Issue; onClose: () => void; onDeleted: () => void }) {
  const t = useT();
  const store = useStore();
  const key = issueKey(project, issue);
  const remove = () => {
    onClose();
    onDeleted();
    void store.docsBoards.deleteIssue(project.id, issue.id).catch(() => {});
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('deleteTitle', { key })}
      closeLabel={t('close')}
      width={440}
      top={120}
      role="alertdialog"
      footer={
        <div className={s.footEnd}>
          <Button variant="secondary" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button variant="danger" onClick={remove}>
            {t('delete')}
          </Button>
        </div>
      }
    >
      <div className={s.delBox}>
        <ColumnIcon id={issue.column} />
        <span className={s.delKey}>{key}</span>
        <span className={s.delTitle}>{issue.title}</span>
      </div>
    </Dialog>
  );
}
