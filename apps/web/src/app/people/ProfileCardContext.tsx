// Opens the profile card (Batch C ProfileCard) from anywhere a person's name or avatar is shown.
// The card itself is built in M3-02; until then open() does nothing.
import { createContext, useContext } from 'react';

export interface ProfileCardApi {
  open(userId: string, anchor: HTMLElement): void;
}

export const ProfileCardContext = createContext<ProfileCardApi>({ open: () => {} });

export function useProfileCard(): ProfileCardApi {
  return useContext(ProfileCardContext);
}
