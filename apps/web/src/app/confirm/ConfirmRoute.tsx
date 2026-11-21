import { useParams } from 'react-router';
import type { Backend } from '../backend';
import { ConfirmPage } from './ConfirmPage';

/** /confirm/:code: the page the confirm email opens, on any device, signed in or not (D-38). */
export function ConfirmRoute({ backend }: { backend: Backend }) {
  const { code = '' } = useParams();
  return <ConfirmPage key={code} code={code} backend={backend} />;
}
