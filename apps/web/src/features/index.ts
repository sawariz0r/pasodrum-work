// The only registration point for feature modules (D-04). Removing a feature = deleting its line and folder.
import type { Feature } from '../app/registry';
import assistant from './assistant';
import boards from './boards';
import docs from './docs';
import files from './files';
import linkCards from './link-cards';
import pins from './pins';
import translate from './translate';

export const features: Feature[] = [pins, files, linkCards, docs, boards, translate, assistant];
