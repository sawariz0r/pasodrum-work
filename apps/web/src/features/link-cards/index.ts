// Link cards (M7): a card under a message for its first link (D-33). Only unencrypted conversations carry
// `Message.links`, so nothing here ever previews a private conversation. Removing this folder and its line in
// features/index.ts leaves the links as plain links.
import { defineFeature } from '../../app/registry';
import { LinkCard } from './LinkCard';

export default defineFeature({
  id: 'link-cards',
  messageParts: [{ id: 'link-card', Part: LinkCard }],
});
