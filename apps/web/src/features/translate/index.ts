// Translate a message in place, only for me (SIDE-01). Removing this folder and its line in features/index.ts leaves
// the app working: nothing was ever sent to the room.
import { defineFeature } from '../../app/registry';
import { textTranslation } from './service';
import { TranslateBody, useTranslateButton } from './Translate';

export default defineFeature({
  id: 'translate',
  messageActions: [{ id: 'translate', useButton: useTranslateButton, Body: TranslateBody }],
  translation: textTranslation,
});
