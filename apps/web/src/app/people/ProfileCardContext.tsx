// Opens the profile card (Batch C ProfileCard) from anywhere a person's name or avatar is shown.
// The card lives in ProfileCard.tsx (M3-02); roles were added in M4 (D-25).
import { createContext, useContext } from 'react';

export interface ProfileCardApi {
  open(userId: string, anchor: HTMLElement): void;
}

export const ProfileCardContext = createContext<ProfileCardApi>({ open: () => {} });

export function useProfileCard(): ProfileCardApi {
  return useContext(ProfileCardContext);
}

/** Fires 'change' after someone's role changes, so open member lists reload. */
export const roleEvents = new EventTarget();
