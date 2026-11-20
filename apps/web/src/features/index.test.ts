import { expect, test } from 'vitest';
import { features } from './index';

test('feature registry is a plain list', () => {
  expect(Array.isArray(features)).toBe(true);
});
