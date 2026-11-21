// Files tab (M7): a built-in tab, every file and image sent here, newest first (D-33). Read-only: removing this
// folder and its line in features/index.ts drops only the tab.
import { createElement } from 'react';
import { defineFeature } from '../../app/registry';
import { FilesTab, PaperclipIcon, useFilesLabel } from './FilesTab';

export default defineFeature({
  id: 'files',
  channelTabs: [{ type: 'files', builtIn: true, icon: createElement(PaperclipIcon), useLabel: useFilesLabel, View: FilesTab }],
});
