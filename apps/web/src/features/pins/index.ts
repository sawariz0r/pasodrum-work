// Pins tab (M7): a built-in tab, newest pin first (D-33). Pin/Unpin in the message menu and the pin glyph are core;
// removing this folder and its line in features/index.ts drops only the tab.
import { createElement } from 'react';
import { PinIcon } from '../../app/icons';
import { defineFeature } from '../../app/registry';
import { PinsTab, usePinsLabel } from './PinsTab';

export default defineFeature({
  id: 'pins',
  channelTabs: [{ type: 'pins', builtIn: true, icon: createElement(PinIcon, { size: 15, strokeWidth: 2 }), useLabel: usePinsLabel, View: PinsTab }],
});
