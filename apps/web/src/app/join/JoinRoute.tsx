import { useParams } from 'react-router';
import { useWorkspace, type InvitePreview, type Session } from '../../matrix';
import type { Backend } from '../backend';
import { useMediaUrl } from '../timeline/Media';
import { JoinPage } from './JoinPage';

type Props = {
  backend: Backend;
  onJoined: (session: Session, identifier: string, preview: InvitePreview) => void;
};

/** /join/:code before sign-in (works without an account, D-26). */
export function JoinRoute(props: Props) {
  const { code = '' } = useParams();
  return <JoinPage key={code} code={code} {...props} />;
}

/** /join/:code while someone is signed in: an open link offers to switch (JoinWrongAccount). */
export function JoinRouteSignedIn({ onSignOut, ...props }: Props & { onSignOut: () => void }) {
  const { code = '' } = useParams();
  const person = useWorkspace((x) => x.me);
  const avatar = useMediaUrl(person.avatarUrl, true);
  return <JoinPage key={code} code={code} current={{ person, avatar }} onSignOut={onSignOut} {...props} />;
}
