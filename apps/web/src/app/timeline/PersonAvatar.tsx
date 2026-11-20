import type { Person } from '../../matrix';
import { Avatar, avatarColor, type AvatarProps } from '../../ui';
import { useMediaUrl } from './Media';

/** A person's avatar; `avatarUrl` is a media ref, resolved to a thumbnail URL (initials until it arrives). */
export function PersonAvatar({ person, size, className }: { person: Person; size?: AvatarProps['size']; className?: string }) {
  const src = useMediaUrl(person.avatarUrl, true);
  return <Avatar size={size} name={person.name} color={avatarColor(person.id)} src={src} className={className} />;
}
