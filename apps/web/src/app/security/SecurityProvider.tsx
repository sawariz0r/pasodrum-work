// M6 (RulesM6, D-31): every encryption dialog lives in one card that swaps its step with a cross-fade.
// The other device's confirmation comes from `security.confirmation`; the rest are local steps
// (recovery key, reset, password, save the key, sign-out warning). No crypto words anywhere.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useLocation, useNavigate } from 'react-router';
import { useStore, useWorkspace, type Confirmation, type Device, type Person, type WorkspaceStore } from '../../matrix';
import { Button, Dialog, TextField, isImeEnter } from '../../ui';
import { CheckIcon } from '../../ui/icons';
import { LaptopIcon, PhoneIcon } from '../settings/icons';
import { settingsState } from '../settings/SettingsRoute';
import { CopyIcon, EyeOffIcon, KeyIcon, RefreshIcon } from './icons';
import { Dots, FailTile, FieldError, OkTile, type View } from './parts';
import { shareConfirmation, startShare, useShareView, type Share } from './share/ShareHistory';
import { firstName } from '../toast';
import { sasName } from './sasNames';
import s from './Security.module.css';

/** `first`: part of making the account's first recovery key (encrypted conversations stay behind the key card until it's saved). */
type Flow =
  /** `remake`: a backup exists that this device can't open; after the current key, make the new one (RecoveryKeyEnter → save). */
  | { step: 'key'; remake?: boolean; first?: boolean }
  | { step: 'reset' }
  | { step: 'password'; first?: boolean }
  | { step: 'save'; key: string; first?: boolean }
  | { step: 'done' }
  | { step: 'signOut'; risk: 'last-device' | 'no-backup' };

/**
 * The account's first recovery key (RulesM6: backup is on before the first private message):
 * 'idle' nothing going on · 'busy' being made · 'open' the password or save step is showing ·
 * 'stopped' the password step was cancelled · 'failed' making it failed (Retry).
 */
export type FirstKey = 'idle' | 'busy' | 'open' | 'stopped' | 'failed';

type SecurityUi = {
  /** Gate → Use another device: ask my other confirmed devices. */
  askDevice(): void;
  /** Gate → Use recovery key. */
  enterKey(): void;
  /** Gate → Can't confirm? */
  reset(): void;
  /** Settings → Devices → Confirm: another device when one is signed in, else the recovery key. */
  confirm(): void;
  /** Settings → Recovery key → New key. Resolves false when it failed; repeat calls while one runs are ignored. */
  newKey(): Promise<boolean>;
  /** A new key is being made (New key shows busy). */
  keyBusy: boolean;
  /** First encrypted conversation on an account without a recovery key (RecoveryKeySave), and its Retry. */
  ensureKey(): void;
  firstKey: FirstKey;
  /** Sign out, after the recovery-key reminder when this is the last confirmed device. */
  signOut(): void;
  /** SIDE-03: profile card → Share earlier messages (1:1 DM with an outside person). */
  shareHistory(dmId: string, person: Person): void;
  /** D-38: the email just confirmed this device; You're all set shows for 1.2 s before the conversation. */
  emailDone: boolean;
};

const noop = () => {};
// Views rendered on their own (component tests, /dev screens) work without the provider; nothing opens.
const Ctx = createContext<SecurityUi>({
  askDevice: noop, enterKey: noop, reset: noop, confirm: noop, newKey: () => Promise.resolve(true), keyBusy: false, ensureKey: noop, firstKey: 'idle', signOut: noop, shareHistory: noop, emailDone: false,
});

export function useSecurityUi(): SecurityUi {
  return useContext(Ctx);
}

/** The dialog that closes itself once a device is confirmed (RulesM6: 1.2 s). */
const doneMs = 1200;

export function SecurityProvider({ onSignOut, children }: { onSignOut: () => void; children: ReactNode }) {
  const store = useStore();
  const [flow, setFlow] = useState<Flow>();
  const [firstKey, setFirstKey] = useState<FirstKey>('idle');
  const [keyBusy, setKeyBusy] = useState(false);
  const [share, setShare] = useState<Share>();
  const inFlight = useRef(false);
  const emailDone = useEmailDone();

  /** Makes a recovery key and shows it (or the password step first). False = it failed. */
  const makeKey = useCallback(
    async (first: boolean): Promise<boolean> => {
      if (inFlight.current) return true;
      inFlight.current = true;
      setKeyBusy(true);
      if (first) setFirstKey('busy');
      try {
        const key = await store.newRecoveryKey();
        setFlow({ step: 'save', key, first });
        if (first) setFirstKey('open');
        return true;
      } catch (err) {
        if (err instanceof Error && (err.message === 'password-required' || err.message === 'backup-unreadable')) {
          setFlow(err.message === 'password-required' ? { step: 'password', first } : { step: 'key', remake: true, first });
          if (first) setFirstKey('open');
          return true;
        }
        if (first) setFirstKey('failed');
        return false;
      } finally {
        inFlight.current = false;
        setKeyBusy(false);
      }
    },
    [store],
  );

  const ui = useMemo<SecurityUi>(
    () => ({
      askDevice: () => store.requestConfirmation(),
      enterKey: () => setFlow({ step: 'key' }),
      reset: () => setFlow({ step: 'reset' }),
      confirm: () => {
        const sec = store.getSnapshot().security;
        if (sec.otherConfirmedDevices > 0) store.requestConfirmation();
        // D-38: never the recovery key; the gate in any DM shows Check your email.
        else if (sec.confirmByEmail) store.requestConfirmEmail().catch(noop);
        else setFlow({ step: 'key' });
      },
      newKey: () => makeKey(false),
      keyBusy,
      ensureKey: () => void makeKey(true),
      firstKey,
      signOut: () => {
        // If the risk can't be checked, warn as if nothing is backed up.
        store.signOutRisk().then(
          (risk) => (risk === 'none' ? onSignOut() : setFlow({ step: 'signOut', risk })),
          () => setFlow({ step: 'signOut', risk: 'no-backup' }),
        );
      },
      shareHistory: (dmId, person) => startShare(store, setShare, dmId, person),
      emailDone,
    }),
    [store, makeKey, keyBusy, firstKey, onSignOut, emailDone],
  );

  const close = () => {
    if (flow && 'first' in flow && flow.first) setFirstKey(flow.step === 'save' ? 'idle' : 'stopped');
    setFlow(undefined);
  };

  return (
    <Ctx.Provider value={ui}>
      {children}
      <SecurityDialog flow={flow} setFlow={setFlow} close={close} makeKey={makeKey} keyBusy={keyBusy} onSignOut={onSignOut} ui={ui} share={share} setShare={setShare} />
    </Ctx.Provider>
  );
}

/**
 * D-38: true for 1.2 s once the email confirmed this device: the phase turns 'confirmed', or the device does while the
 * page waits for the link. Set while rendering, so the conversation never shows before You're all set.
 */
function useEmailDone(): boolean {
  const byEmail = useWorkspace((x) => !!x.security.confirmByEmail);
  const device = useWorkspace((x) => x.security.device);
  const phase = useWorkspace((x) => x.security.emailConfirm?.phase);
  const [done, setDone] = useState(false);
  const [prev, setPrev] = useState({ device, phase });
  if (prev.device !== device || prev.phase !== phase) {
    setPrev({ device, phase });
    const tapped = phase === 'confirmed' && prev.phase !== 'confirmed' && prev.phase !== undefined;
    const confirmedWaiting = device === 'confirmed' && prev.device === 'unconfirmed' && (phase === 'sent' || phase === 'confirmed');
    if (byEmail && (tapped || confirmedWaiting)) setDone(true);
  }
  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => setDone(false), doneMs);
    return () => clearTimeout(timer);
  }, [done]);
  return done;
}

function SecurityDialog({
  flow,
  setFlow,
  close,
  makeKey,
  keyBusy,
  onSignOut,
  ui,
  share,
  setShare,
}: {
  flow?: Flow;
  setFlow: (f: Flow | undefined) => void;
  close: () => void;
  makeKey: (first: boolean) => Promise<boolean>;
  keyBusy: boolean;
  onSignOut: () => void;
  ui: SecurityUi;
  share?: Share;
  setShare: React.Dispatch<React.SetStateAction<Share | undefined>>;
}) {
  const { t } = useTranslation();
  const store = useStore();
  const confirmation = useWorkspace((x) => x.security.confirmation);
  const person = confirmation?.role === 'person';
  /** SIDE-03: I asked (sharing with them); otherwise they asked me. */
  const asker = !!shareConfirmation(share, confirmation);
  const failedPhase = !!confirmation && ['declined', 'timeout', 'mismatch'].includes(confirmation.phase);

  // The approver's side ends quietly when the new device declines, times out or sees different emoji. A person
  // confirmation ends quietly on a match (the share goes on to its question) and, on the asked side, when it fails.
  const quietEnd = (confirmation?.role === 'approver' && failedPhase) || (person && (confirmation.phase === 'done' || (!asker && failedPhase)));
  useEffect(() => {
    if (quietEnd) store.dismissConfirmation();
  }, [quietEnd, store]);

  // Asked to confirm it's me (ConfirmPersonAsk): the emoji show straight away, since we're on a call.
  const autoAccept = person && confirmation.phase === 'asked';
  useEffect(() => {
    if (autoAccept) store.acceptConfirmation();
  }, [autoAccept, store]);

  const done = confirmation?.phase === 'done' || flow?.step === 'done';
  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => (confirmation?.phase === 'done' ? store.dismissConfirmation() : setFlow(undefined)), doneMs);
    return () => clearTimeout(timer);
  }, [done, confirmation?.phase, store, setFlow]);

  const confirmView = useConfirmationView(confirmation && !quietEnd ? confirmation : undefined, store, ui, asker);
  const shareView = useShareView(share, setShare, confirmation, store, ui.confirm);
  const flowView = useFlowView(flow, setFlow, close, makeKey, keyBusy, onSignOut, store);
  const shown = confirmView ?? shareView ?? flowView;
  if (!shown) return null;

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && shown.closeable && shown.onClose()}
      title={
        <span key={shown.key} className={s.step}>
          {shown.title}
        </span>
      }
      tile={shown.tile}
      closeLabel={shown.closeable && !shown.tile ? t('security.close') : undefined}
      width={shown.width}
      top={168}
      role={shown.alert ? 'alertdialog' : 'dialog'}
      className={s.card}
      bodyClassName={s.body}
      footer={
        shown.footer && (
          <div key={shown.key} className={`${s.step} ${s.foot}`}>
            {shown.footer}
          </div>
        )
      }
    >
      {shown.body && (
        <div key={shown.key} className={s.step}>
          {shown.body}
        </div>
      )}
    </Dialog>
  );
}

function useConfirmationView(c: Confirmation | undefined, store: WorkspaceStore, ui: SecurityUi, asker: boolean): View | undefined {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const devices = useOtherDevices(c?.role === 'new' && c.phase === 'waiting');
  if (!c) return undefined;
  const lang = i18n.language;
  const cancel = () => store.declineConfirmation();
  if (c.role === 'person') return personView(c, store, asker, t, lang);

  if (c.phase === 'waiting') {
    return {
      key: 'waiting',
      title: t('security.waitTitle'),
      closeable: false,
      width: 440,
      onClose: cancel,
      body: (
        <>
          {devices.length > 0 && (
            <ul className={s.box}>
              {devices.map((d) => (
                <li key={d.id}>
                  <DeviceLine name={d.name} />
                </li>
              ))}
            </ul>
          )}
          <Dots label={t('security.waiting')} centred />
        </>
      ),
      footer: (
        <>
          <span className={s.spacer} />
          <Button variant="secondary" onClick={cancel}>
            {t('security.cancel')}
          </Button>
        </>
      ),
    };
  }

  if (c.phase === 'asked') {
    const no = () => {
      store.declineConfirmation();
      navigate('/settings/devices', { state: settingsState(location) });
    };
    return {
      key: 'asked',
      title: t('security.approveTitle'),
      closeable: false,
      alert: true,
      width: 440,
      onClose: no,
      body: (
        <div className={s.box}>
          <DeviceLine name={c.otherDevice ?? ''} meta={t('security.justNow')} />
        </div>
      ),
      footer: (
        <>
          <span className={s.spacer} />
          <Button variant="secondary" onClick={no}>
            {t('security.notMe')}
          </Button>
          <Button onClick={() => store.acceptConfirmation()}>{t('security.itsMe')}</Button>
        </>
      ),
    };
  }

  if (c.phase === 'compare' || c.phase === 'matched') {
    const ready = c.emoji?.length === 7;
    return {
      key: 'compare',
      title: c.role === 'approver' && c.otherDevice ? t('security.compareOn', { device: c.otherDevice }) : t('security.compareTitle'),
      closeable: false,
      width: 500,
      onClose: cancel,
      body: (
        <ul className={s.sas}>
          {(c.emoji ?? []).map((e, i) => (
            <li key={i} className={s.sasItem}>
              <span className={s.sasEmoji} aria-hidden="true">
                {e.emoji}
              </span>
              <span className={s.sasName}>{sasName(e.index, lang)}</span>
            </li>
          ))}
        </ul>
      ),
      footer:
        c.phase === 'matched' ? (
          <>
            <span className={s.spacer} />
            <Dots label={t('security.waiting')} />
          </>
        ) : (
          <>
            <span className={s.spacer} />
            <Button variant="secondary" disabled={!ready} onClick={() => store.confirmEmoji(false)}>
              {t('security.noMatch')}
            </Button>
            <Button disabled={!ready} onClick={() => store.confirmEmoji(true)}>
              {t('security.match')}
            </Button>
          </>
        ),
    };
  }

  if (c.phase === 'done') {
    return {
      key: 'done',
      title: c.role === 'approver' && c.otherDevice ? t('security.doneOn', { device: c.otherDevice }) : t('security.done'),
      tile: <OkTile />,
      closeable: true,
      width: 440,
      onClose: () => store.dismissConfirmation(),
      body: <div className={s.doneGap} />,
    };
  }

  const title =
    c.phase === 'timeout'
      ? t('security.timeout')
      : c.phase === 'mismatch'
        ? t('security.mismatch')
        : c.otherDevice
          ? t('security.declined', { device: c.otherDevice })
          : t('security.declinedAny');
  return {
    key: `failed-${c.phase}`,
    title,
    tile: <FailTile />,
    closeable: true,
    alert: true,
    width: 440,
    onClose: () => store.dismissConfirmation(),
    body: <span />,
    footer: (
      <>
        <span className={s.spacer} />
        {store.getSnapshot().security.confirmByEmail ? (
          <Button
            variant="secondary"
            onClick={() => {
              store.dismissConfirmation();
              store.requestConfirmEmail().catch(() => {});
            }}
          >
            {t('security.email.emailMe')}
          </Button>
        ) : (
          <Button
            variant="secondary"
            onClick={() => {
              store.dismissConfirmation();
              ui.enterKey();
            }}
          >
            {t('security.useKey')}
          </Button>
        )}
        <Button
          onClick={() => {
            store.dismissConfirmation();
            store.requestConfirmation();
          }}
        >
          {t('security.tryAgain')}
        </Button>
      </>
    ),
  };
}

/**
 * SIDE-03: comparing emoji with another person, on a call (ShareHistoryVerify, ConfirmPersonAsk). The M6 layout with its
 * own titles; both sides can close it. 'done' and the asked side's failures end quietly (SecurityDialog).
 */
function personView(c: Confirmation, store: WorkspaceStore, asker: boolean, t: TFunction, lang: string): View {
  const name = firstName(c.person?.name ?? '');
  const cancel = () => store.declineConfirmation();
  const title = asker ? t('security.share.verifyTitle', { name }) : t('security.share.askTitle', { name });
  if (asker && ['declined', 'timeout', 'mismatch'].includes(c.phase)) {
    return {
      key: `person-failed-${c.phase}`,
      title: c.phase === 'mismatch' ? t('security.mismatch') : t('security.share.noAnswer', { name }),
      tile: <FailTile />,
      closeable: true,
      alert: true,
      width: 440,
      onClose: () => store.dismissConfirmation(),
      body: <span />,
      footer: (
        <>
          <span className={s.spacer} />
          <Button variant="secondary" onClick={() => store.dismissConfirmation()}>
            {t('security.cancel')}
          </Button>
          <Button
            onClick={() => {
              // Requesting again replaces the old request itself; dismissing first would empty the phase and drop the share.
              if (c.person) store.requestPersonConfirmation(c.person.id);
              else store.dismissConfirmation();
            }}
          >
            {t('security.tryAgain')}
          </Button>
        </>
      ),
    };
  }
  if (c.phase === 'waiting') {
    return {
      key: 'person-waiting',
      title,
      closeable: true,
      width: 500,
      onClose: cancel,
      body: <Dots label={t('security.share.waiting', { name })} centred />,
      footer: (
        <>
          <span className={s.spacer} />
          <Button variant="secondary" onClick={cancel}>
            {t('security.cancel')}
          </Button>
        </>
      ),
    };
  }
  const ready = c.emoji?.length === 7;
  return {
    key: 'person-compare',
    title,
    closeable: true,
    width: 500,
    onClose: cancel,
    body: (
      <ul className={s.sas}>
        {(c.emoji ?? []).map((e, i) => (
          <li key={i} className={s.sasItem}>
            <span className={s.sasEmoji} aria-hidden="true">
              {e.emoji}
            </span>
            <span className={s.sasName}>{sasName(e.index, lang)}</span>
          </li>
        ))}
      </ul>
    ),
    footer:
      c.phase === 'matched' ? (
        <>
          <span className={s.spacer} />
          <Dots label={t('security.share.waiting', { name })} />
        </>
      ) : (
        <>
          <span className={s.spacer} />
          <Button variant="secondary" disabled={!ready} onClick={() => store.confirmEmoji(false)}>
            {t('security.noMatch')}
          </Button>
          <Button disabled={!ready} onClick={() => store.confirmEmoji(true)}>
            {t('security.match')}
          </Button>
        </>
      ),
  };
}

/** My other confirmed devices, for the waiting step (ConfirmWaiting). */
function useOtherDevices(active: boolean): Device[] {
  const store = useStore();
  const [list, setList] = useState<Device[]>([]);
  useEffect(() => {
    if (!active) return;
    let live = true;
    store.devices().then(
      (all) => live && setList(all.filter((d) => !d.current && d.confirmed !== false)),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [active, store]);
  return list;
}

function useFlowView(
  flow: Flow | undefined,
  setFlow: (f: Flow | undefined) => void,
  close: () => void,
  makeKey: (first: boolean) => Promise<boolean>,
  keyBusy: boolean,
  onSignOut: () => void,
  store: WorkspaceStore,
): View | undefined {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [wrong, setWrong] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  // Each step (and each new key shown) starts empty.
  const stepId = flow ? `${flow.step}:${flow.step === 'save' ? flow.key : ''}` : '';
  const [stepNow, setStepNow] = useState(stepId);
  if (stepNow !== stepId) {
    setStepNow(stepId);
    setText('');
    setWrong(false);
    setFailed(false);
    setBusy(false);
    setCopied(false);
  }

  if (!flow) return undefined;
  const edit = (value: string) => {
    setText(value);
    setWrong(false);
    setFailed(false);
  };
  /** `wrongCode` marks the field; any other rejection shows the one-line error. */
  const run = (action: () => Promise<unknown>, wrongCode: string) => {
    if (busy || !text.trim()) return;
    setBusy(true);
    setFailed(false);
    action().then(
      () => setBusy(false),
      (err: unknown) => {
        setBusy(false);
        if (err instanceof Error && err.message === wrongCode) setWrong(true);
        else setFailed(true);
      },
    );
  };
  const failLine = failed && <FieldError id="security-failed" text={t('security.failed')} />;
  const toKey = () => {
    if (keyBusy) return;
    setFailed(false);
    void makeKey(false).then((ok) => !ok && setFailed(true));
  };
  // isImeEnter: a real Enter, not the one that commits a Japanese IME composition.
  const enter = (submit: () => void) => (e: React.KeyboardEvent) => {
    if (!e.shiftKey && isImeEnter(e)) {
      e.preventDefault();
      submit();
    }
  };
  const cancelBtn = (
    <Button variant="secondary" onClick={close}>
      {t('security.cancel')}
    </Button>
  );

  switch (flow.step) {
    case 'key': {
      const { remake, first } = flow;
      const submit = () =>
        run(async () => {
          await store.useRecoveryKey(normalizeKey(text));
          if (!remake) return setFlow({ step: 'done' });
          // makeKey moves on to the save (or password) step; a failure shows the error line here.
          if (!(await makeKey(!!first))) throw new Error('failed');
        }, 'wrong-key');
      return {
        key: 'key',
        title: t('security.keyTitle'),
        closeable: true,
        width: 440,
        onClose: close,
        body: (
          <div className={s.field}>
            <textarea
              className={[s.keyInput, wrong && s.invalid].filter(Boolean).join(' ')}
              aria-label={t('security.keyLabel')}
              aria-invalid={wrong || undefined}
              aria-describedby={wrong ? 'security-key-error' : undefined}
              rows={2}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
              autoFocus
              value={text}
              onChange={(e) => edit(e.target.value)}
              onKeyDown={enter(submit)}
            />
            {wrong && <FieldError id="security-key-error" text={t('security.keyWrong')} />}
            {failLine}
          </div>
        ),
        footer: (
          <>
            <span className={s.spacer} />
            {cancelBtn}
            <Button onClick={submit} disabled={!text.trim()} aria-busy={busy || undefined}>
              {t('security.confirm')}
            </Button>
          </>
        ),
      };
    }
    case 'reset': {
      // D-38: a client's new key goes to our server by itself; no save step.
      const byEmail = !!store.getSnapshot().security.confirmByEmail;
      const submit = () => run(() => store.resetEncryption(text).then((key) => setFlow(byEmail ? undefined : { step: 'save', key })), 'wrong-password');
      return {
        key: 'reset',
        title: t('security.resetTitle'),
        closeable: true,
        alert: true,
        width: 480,
        onClose: close,
        body: (
          <>
            <ul className={`${s.box} ${s.lines}`}>
              <li className={s.line}>
                <EyeOffIcon className={s.dangerIcon} />
                <span>{t('security.resetLoss')}</span>
              </li>
              <li className={s.line}>
                <RefreshIcon className={s.mutedIcon} />
                <span>{t('security.resetOthers')}</span>
              </li>
            </ul>
            <TextField
              className={s.field}
              label={t('security.password')}
              type="password"
              autoComplete="current-password"
              autoFocus
              value={text}
              error={wrong ? t('security.wrongPassword') : undefined}
              onChange={(e) => edit(e.target.value)}
              onKeyDown={enter(submit)}
            />
            {failed && <div className={s.lineError}>{failLine}</div>}
          </>
        ),
        footer: (
          <>
            <span className={s.spacer} />
            {cancelBtn}
            <Button variant="danger" onClick={submit} disabled={!text} aria-busy={busy || undefined}>
              {t('security.reset')}
            </Button>
          </>
        ),
      };
    }
    case 'password': {
      const first = flow.first;
      const submit = () =>
        run(
          () =>
            store.newRecoveryKey(text).then(
              (key) => setFlow({ step: 'save', key, first }),
              (err: unknown) => {
                if (err instanceof Error && err.message === 'backup-unreadable') setFlow({ step: 'key', remake: true, first });
                else throw err;
              },
            ),
          'wrong-password',
        );
      return {
        key: 'password',
        title: t('security.pwTitle'),
        closeable: true,
        width: 440,
        onClose: close,
        body: (
          <>
            <TextField
              className={s.field}
              label={t('security.password')}
              hideLabel
              type="password"
              autoComplete="current-password"
              autoFocus
              value={text}
              error={wrong ? t('security.wrongPassword') : undefined}
              onChange={(e) => edit(e.target.value)}
              onKeyDown={enter(submit)}
            />
            {failed && <div className={s.lineError}>{failLine}</div>}
          </>
        ),
        footer: (
          <>
            <span className={s.spacer} />
            {cancelBtn}
            <Button onClick={submit} disabled={!text} aria-busy={busy || undefined}>
              {t('security.continue')}
            </Button>
          </>
        ),
      };
    }
    case 'save': {
      const groups = flow.key.trim().split(/\s+/);
      const lines = [];
      for (let i = 0; i < groups.length; i += 4) lines.push(groups.slice(i, i + 4).join(' '));
      const copy = () =>
        void navigator.clipboard?.writeText(flow.key).then(
          () => setCopied(true),
          () => {},
        );
      return {
        key: 'save',
        title: t('security.saveTitle'),
        closeable: false,
        width: 440,
        onClose: close,
        body: (
          <>
            <div className={s.keyCard} translate="no">
              {lines.map((line, i) => (
                <span key={i} className={s.keyLine}>
                  {line}
                </span>
              ))}
            </div>
            <span aria-live="polite" className={s.sr}>
              {copied ? t('security.copied') : ''}
            </span>
          </>
        ),
        footer: (
          <>
            <Button variant="secondary" onClick={copy} icon={copied ? <CheckIcon key="ok" className={s.copiedIcon} size={15} strokeWidth={2.6} /> : <CopyIcon className={s.mutedIcon} />}>
              {copied ? t('security.copied') : t('security.copy')}
            </Button>
            <span className={s.spacer} />
            <Button onClick={close}>{t('security.saved')}</Button>
          </>
        ),
      };
    }
    case 'done':
      return {
        key: 'done',
        title: t('security.done'),
        tile: <OkTile />,
        closeable: true,
        width: 440,
        onClose: close,
        body: <div className={s.doneGap} />,
      };
    case 'signOut': {
      // D-38: clients never see a recovery key.
      const byEmail = !!store.getSnapshot().security.confirmByEmail;
      const out = () => {
        close();
        onSignOut();
      };
      if (flow.risk === 'no-backup') {
        return {
          key: 'signOut-no-backup',
          title: t('security.signOutLoseTitle'),
          closeable: true,
          alert: true,
          width: 480,
          onClose: close,
          body: (
            <>
              <div className={`${s.box} ${s.line}`}>
                <EyeOffIcon className={s.dangerIcon} />
                <span>{t('security.signOutLose')}</span>
              </div>
              {failed && <div className={s.lineError}>{failLine}</div>}
            </>
          ),
          footer: (
            <>
              <span className={s.spacer} />
              <Button variant="secondary" className={s.dangerText} onClick={out}>
                {t('security.signOutAnyway')}
              </Button>
              {!byEmail && (
                <Button onClick={toKey} aria-busy={keyBusy || undefined}>
                  {t('security.saveKey')}
                </Button>
              )}
            </>
          ),
        };
      }
      return {
        key: 'signOut',
        title: t('security.signOutTitle'),
        closeable: true,
        alert: true,
        width: 480,
        onClose: close,
        body: (
          <>
            <div className={`${s.box} ${s.line}`}>
              {byEmail ? <EyeOffIcon className={s.mutedIcon} /> : <KeyIcon size={17} strokeWidth={2} className={s.mutedIcon} />}
              <span>{t(byEmail ? 'security.signOutMaybeLose' : 'security.signOutKey')}</span>
            </div>
            {failed && <div className={s.lineError}>{failLine}</div>}
          </>
        ),
        footer: (
          <>
            {!byEmail && (
              <button type="button" className={s.textButton} onClick={toKey} aria-busy={keyBusy || undefined}>
                {t('security.newKey')}
              </button>
            )}
            <span className={s.spacer} />
            {cancelBtn}
            <Button variant="danger" onClick={out}>
              {t('security.signOut')}
            </Button>
          </>
        ),
      };
    }
  }
}

const phoneRe = /iphone|ipad|android|ios|phone|mobile/i;

/** Recovery keys are case-sensitive (base58): only width variants (NFKC), spaces and dashes are dropped. */
export function normalizeKey(text: string): string {
  return text.normalize('NFKC').replace(/[\s\-‐-―−]/g, '');
}

function DeviceLine({ name, meta }: { name: string; meta?: string }) {
  return (
    <span className={s.device}>
      <span className={s.deviceIcon}>{phoneRe.test(name) ? <PhoneIcon size={17} /> : <LaptopIcon size={17} />}</span>
      <span className={s.deviceText}>
        <span className={s.deviceName}>{name}</span>
        {meta && <span className={s.deviceMeta}>{meta}</span>}
      </span>
    </span>
  );
}
