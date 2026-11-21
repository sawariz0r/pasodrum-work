// The composer line (ClientMarkFinal): someone in this conversation doesn't belong to the space I'm in.
// Team and Externals see it (D-36): Channel.outside is team-only, and useShowExternal keeps clients out of it in DMs.
import { Trans } from 'react-i18next';
import { useWorkspace, type Person, type Space } from '../../matrix';
import { listParts } from '../format';
import { CompanyTile, ExternalMark } from '../people/Face';
import { others, useShowExternal } from '../people/names';
import s from './Channels.module.css';
import { findChannel } from './shared';

type OutsideGroups = { companies: { space: Space; people: Person[] }[]; externals: Person[] };

/**
 * Clients by company, and Externals: an outside person whose client space I can't resolve counts as an External.
 * `here` is the space of the channel; a client space's own clients there don't count. DMs have no `here`.
 */
function outsideGroups(people: Person[], spaces: Space[], here?: string): OutsideGroups | null {
  const companies = new Map<string, { space: Space; people: Person[] }>();
  const externals: Person[] = [];
  for (const p of people) {
    if (!p.external) continue;
    const space = p.client ? spaces.find((sp) => sp.id === p.client && sp.kind === 'client') : undefined;
    if (!space) externals.push(p);
    else if (space.id !== here) {
      const group = companies.get(space.id);
      if (group) group.people.push(p);
      else companies.set(space.id, { space, people: [p] });
    }
  }
  return companies.size || externals.length ? { companies: [...companies.values()], externals } : null;
}

function useOutsideGroups(channelId: string): { groups: OutsideGroups | null; channel: boolean } {
  const show = useShowExternal();
  const meId = useWorkspace((x) => x.me.id);
  const spaces = useWorkspace((x) => x.spaces);
  const channel = useWorkspace((x) => findChannel(x, channelId));
  const dm = useWorkspace((x) => (channel ? undefined : x.dms.find((d) => d.id === channelId)));
  if (!show) return { groups: null, channel: false };
  if (channel) return { groups: outsideGroups(channel.outside ?? [], spaces, channel.spaceId), channel: true };
  return { groups: dm && !dm.system ? outsideGroups(others(dm, meId), spaces) : null, channel: false };
}

function Companies({ names }: { names: string[] }) {
  return listParts(names).map((part, i) => (part.type === 'element' ? <strong key={i}>{part.value}</strong> : part.value));
}

function LineText({ groups: { companies, externals } }: { groups: OutsideGroups }) {
  const b = { b: <strong /> };
  const only = companies.length === 1 && !externals.length ? companies[0]! : undefined;
  if (only || !companies.length) {
    const [first, ...rest] = only ? only.people : externals;
    const values = { name: first!.name, company: only?.space.name, count: rest.length };
    // Names are typed by people: escaped before the markup is parsed, so "<b>…</b>" in a name can't fake a company.
    const safe = { values, components: b, tOptions: { interpolation: { escapeValue: true } }, shouldUnescape: true };
    if (only) return <Trans i18nKey={rest.length ? 'spaces.outside.clients' : 'spaces.outside.client'} {...safe} />;
    return <Trans i18nKey={rest.length ? 'spaces.outside.externals' : 'spaces.outside.external'} {...safe} />;
  }
  const list = { ...b, companies: <Companies names={companies.map((c) => c.space.name)} /> };
  if (!externals.length) return <Trans i18nKey="spaces.outside.companies" components={list} />;
  if (externals.length === 1) return <Trans i18nKey="spaces.outside.withExternal" components={list} />;
  return <Trans i18nKey="spaces.outside.withExternals" values={{ count: externals.length }} components={list} />;
}

/** Joined to the composer's top edge: up to three marks, then who. In channels it opens Members; DMs have no click. */
export function OutsideLine({ channelId, onMembers }: { channelId: string; onMembers: () => void }) {
  const { groups, channel } = useOutsideGroups(channelId);
  if (!groups) return null;
  const marks = groups.companies.map((c) => <CompanyTile key={c.space.id} space={c.space} size={18} />);
  if (groups.externals.length) marks.push(<ExternalMark key="external" size={18} />);
  const content = (
    <>
      <span className={s.outsideMarks} aria-hidden="true">
        {marks.slice(0, 3)}
      </span>
      <span>
        <LineText groups={groups} />
      </span>
    </>
  );
  return channel ? (
    <button type="button" className={s.outsideLine} onClick={onMembers}>
      {content}
    </button>
  ) : (
    <div role="note" className={s.outsideLine}>
      {content}
    </div>
  );
}
