import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { APP_NAME, VERSION } from './index';

describe('KiranaAI Backend', () => {
  it('should export app name', () => {
    expect(APP_NAME).toBe('KiranaAI');
  });

  it('should export version', () => {
    expect(VERSION).toBe('0.1.0');
  });
});

describe('Project setup verification (property-based)', () => {
  it('fast-check is operational', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => {
        expect(a + b).toBe(b + a);
      })
    );
  });
});
