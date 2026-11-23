// The Assistant (SIDE-14), team only: the panel, the spark, the ⌘K row, ⌘J and "Ask about this". Removing this folder and its
// line in features/index.ts leaves the shell's slots empty and the app working.
import { defineFeature } from '../../app/registry';
import { assistantSlot, useAskAboutThis } from './slot';

export default defineFeature({
  id: 'assistant',
  assistant: assistantSlot,
  messageActions: [{ id: 'assistant', first: true, useButton: useAskAboutThis }],
});
