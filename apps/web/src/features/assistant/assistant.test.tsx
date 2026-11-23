// @vitest-environment happy-dom
// D-30: model strings never become markup, links or images; the conversation is cleared on sign-out and on a new day at open,
// and a turn that used sealed text is never sent back as history.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initI18n } from '../../app/i18n';
import { notifySignedOut } from '../../app/signOut';
import { createFakeStore } from '../../app/testing/fakeStore';
import { WorkspaceProvider, type Answer, type AssistantRequest, type WorkspaceStore } from '../../matrix';
import { TurnView } from './Answer';
import { ask, getState, historyOf, opened, reset, type Turn } from './session';

initI18n();
afterEach(() => {
  cleanup();
  notifySignedOut();
});

const hostile = ['<img src=x onerror=alert(1)>', '**bold** [click](https://evil.example/x) `code`', '<a href="https://evil.example">here</a>', 'https://evil.example www.evil.example'];

function answerOf(over: Partial<Answer> = {}): Answer {
  return { outcome: 'answered', depth: 'quick', say: 'ok', parts: [], looked: [], usedSealed: false, thorough: 'ok', ...over };
}

describe('model strings', () => {
  it('draws tags, Markdown and addresses as the characters they are: no link, image or markup', () => {
    const store = createFakeStore();
    const me = store.getSnapshot().me;
    const answer = answerOf({
      say: hostile.join(' '),
      parts: [
        { t: 'source', target: { k: 'page', page: 'p1' }, plain: hostile[0]! },
        { t: 'heading', target: { k: 'person', user: '@x:pasodrum.localhost' }, plain: hostile[1]! },
        { t: 'open', target: { k: 'project', project: 'none' }, plain: hostile[2]! },
      ],
      looked: [{ target: { k: 'project', project: 'none' }, plain: hostile[3]!, count: 2 }],
    });
    const turn: Turn = {
      id: 1,
      ask: hostile[1]!,
      label: null,
      request: {} as AssistantRequest,
      state: 'answered',
      answer,
      rows: [{ message: { id: '$hostile', channelId: '!general', sender: me, body: hostile.join('\n'), ts: Date.now(), status: 'sent' } }],
    };
    const { container } = render(
      <WorkspaceProvider store={store}>
        <MemoryRouter>
          <TurnView turn={turn} closer onCloser={() => {}} onRetry={() => {}} />
        </MemoryRouter>
      </WorkspaceProvider>,
    );
    fireEvent.click(screen.getByRole('button', { expanded: false }));

    expect(container.querySelectorAll('a, img, script, iframe, strong, em, b, i, code, pre').length).toBe(0);
    expect(container.querySelectorAll('[href], [src], [onerror]').length).toBe(0);
    expect(container.textContent).toContain(hostile[0]);
    expect(container.textContent).toContain(hostile[1]);
    expect(container.textContent).toContain(hostile[3]);
  });
});

function recording(store: WorkspaceStore) {
  const sent: AssistantRequest[] = [];
  const real = store.assistantAsk.bind(store);
  const answers: Partial<Answer>[] = [];
  store.assistantAsk = async (request, opts) => {
    sent.push(request);
    const answer = await real(request, opts);
    return { ...answer, ...answers.shift() };
  };
  return { sent, answers };
}

const settled = () => vi.waitFor(() => expect(getState().session.turns.every((t) => t.state !== 'working')).toBe(true));
const askNow = (store: WorkspaceStore, user: string, text: string) => ask(store, user, { text, chip: null, label: null, lang: 'en', thoroughOk: true });

describe('the conversation', () => {
  it('is cleared on sign-out, and a running ask is stopped', async () => {
    const store = createFakeStore({ loadMs: 0 });
    const user = store.getSnapshot().me.id;
    reset(user);
    askNow(store, user, 'what changed');
    await settled();
    expect(getState().session.turns).toHaveLength(1);

    const signal = vi.fn();
    const real = store.assistantAsk.bind(store);
    store.assistantAsk = (request, opts) => {
      opts.signal.addEventListener('abort', signal);
      return real(request, opts);
    };
    askNow(store, user, 'slow one');
    notifySignedOut();
    expect(signal).toHaveBeenCalled();
    expect(getState().session).toMatchObject({ user: '', turns: [], draft: '' });
  });

  it('starts empty when the panel opens on a later local day, never on the same day', async () => {
    const store = createFakeStore({ loadMs: 0 });
    const user = store.getSnapshot().me.id;
    const evening = new Date(2026, 10, 23, 23, 50);
    opened(user, evening);
    askNow(store, user, 'what changed');
    await settled();
    opened(user, new Date(2026, 10, 23, 23, 59));
    expect(getState().session.turns).toHaveLength(1);
    opened(user, new Date(2026, 10, 24, 0, 1));
    expect(getState().session.turns).toHaveLength(0);
  });

  it('sends the last six turns as history, leaving out any that used sealed text', async () => {
    const store = createFakeStore({ loadMs: 0 });
    const user = store.getSnapshot().me.id;
    reset(user);
    const { sent, answers } = recording(store);
    answers.push({ say: 'from sealed', usedSealed: true });
    askNow(store, user, 'first');
    await settled();
    askNow(store, user, 'second');
    await settled();
    expect(sent[1]!.history).toEqual([]);
    for (const n of [3, 4, 5, 6, 7, 8, 9]) {
      askNow(store, user, `ask ${n}`);
      await settled();
    }
    askNow(store, user, 'last');
    await settled();
    const history = sent.at(-1)!.history;
    expect(history.map((h) => h.ask)).toEqual(['ask 4', 'ask 5', 'ask 6', 'ask 7', 'ask 8', 'ask 9']);
    expect(history.some((h) => h.say === 'from sealed')).toBe(false);
    expect(historyOf(getState().session.turns)).toHaveLength(6);
  });
});
