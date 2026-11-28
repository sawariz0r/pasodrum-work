import { useLocation, useParams } from 'react-router';
import { useWorkspace, type InvitePreview, type Session } from '../../matrix';
import type { Backend } from '../backend';
import { useMediaUrl } from '../timeline/Media';
import { JoinPage } from './JoinPage';

type Props = {
  backend: Backend;
  onJoined: (session: Session, identifier: string, preview: InvitePreview) => void;
};

const useProof = () => useLocation().hash.slice(1) || undefined;

/** /join/:code before sign-in (works without an account, D-26). */
export function JoinRoute(props: Props) {
  const { code = '' } = useParams();
  return <JoinPage key={code} code={code} proof={useProof()} {...props} />;
}

/** /join/:code while someone is signed in: an open link offers to switch (JoinWrongAccount). */
export function JoinRouteSignedIn({ onSignOut, ...props }: Props & { onSignOut: () => void }) {
  const { code = '' } = useParams();
  const proof = useProof();
  const person = useWorkspace((x) => x.me);
  const avatar = useMediaUrl(person.avatarUrl, true);
  return <JoinPage key={code} code={code} proof={proof} current={{ person, avatar }} onSignOut={onSignOut} {...props} />;
}
