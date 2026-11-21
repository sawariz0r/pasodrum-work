// The only registration point for feature modules (D-04). Removing a feature = deleting its line and folder.
import type { Feature } from '../app/registry';
import translate from './translate';

export const features: Feature[] = [translate];
