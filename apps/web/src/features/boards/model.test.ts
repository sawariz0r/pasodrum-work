import { describe, expect, it } from 'vitest';
import type { Issue, Person, Project } from '../../matrix';
import { allGroups } from './model';

const ann: Person = { id: '@ann:x', name: 'Ann' } as Person;
const bo: Person = { id: '@bo:x', name: 'Bo' } as Person;
const columns = ['todo', 'doing', 'wait', 'done'].map((id) => ({ id }));

let n = 0;
const issue = (column: string, o: Partial<Issue> = {}): Issue => ({ id: `$${++n}`, projectId: '', n, title: '', column, order: 'a', ...o });
const project = (id: string, spaceId: string, issues: Issue[]): Project => ({
  id,
  spaceId,
  name: id,
  key: id,
  colour: '',
  columns,
  issues: issues.map((i) => ({ ...i, projectId: id })),
  loading: false,
  canAddColumn: true,
});

const keys = (gs: ReturnType<typeof allGroups>) => gs.map((g) => [g.project.id, g.issues.map((i) => i.title)]);

describe('allGroups', () => {
  const client = project('POR', '!client', [issue('wait', { title: 'wait', assignee: bo }), issue('todo', { title: 'todo' })]);
  const web = project('WEB', '!work', [
    issue('todo', { title: 'todo', assignee: ann }),
    issue('doing', { title: 'late', assignee: bo, due: '2000-01-01' }),
    issue('done', { title: 'done', assignee: ann }),
    issue('todo', { title: 'future', due: '2999-01-01' }),
  ]);

  it('puts the active space first, late issues first, then by column, and leaves out done', () => {
    expect(keys(allGroups([client, web], '!work'))).toEqual([
      ['WEB', ['late', 'todo', 'future']],
      ['POR', ['todo', 'wait']],
    ]);
  });

  it('filters by assignee or no one, and drops projects left empty', () => {
    expect(keys(allGroups([client, web], '!work', ann.id))).toEqual([['WEB', ['todo']]]);
    expect(keys(allGroups([client, web], '!client', null))).toEqual([
      ['POR', ['todo']],
      ['WEB', ['future']],
    ]);
  });
});
