import { describe, test, it, expect } from 'vitest';
import { bumpVersion, getNextVersion, parseCommit, bumpTypes } from './utils';
import { t } from 'vitest/dist/types-198fd1d9';
import { satisfies } from 'semver';

describe('utils', () => {

  describe('bumpVersion', () => {
    test('should bump the version', () => {
      // No pre-release bumps
      expect(bumpVersion('1.0.0', 'major', 'none')).toBe('2.0.0');
      expect(bumpVersion('1.0.0', 'minor', 'none')).toBe('1.1.0');
      expect(bumpVersion('1.0.0', 'patch', 'none')).toBe('1.0.1');
    });

    test('should bump to a pre-release version', () => {
      expect(bumpVersion('1.0.0', 'major', 'alpha')).toBe('2.0.0-alpha.0');
      expect(bumpVersion('1.0.0', 'minor', 'alpha')).toBe('1.1.0-alpha.0');
      expect(bumpVersion('1.0.0', 'patch', 'alpha')).toBe('1.0.1-alpha.0');
    });

    test('should bump to a pre-release version with a pre-release version', () => {
      expect(bumpVersion('1.0.0-alpha.0', 'major', 'alpha')).toBe('2.0.0-alpha.0');
      expect(bumpVersion('1.0.0-alpha.0', 'minor', 'alpha')).toBe('1.1.0-alpha.0');
      expect(bumpVersion('1.0.0-alpha.0', 'patch', 'alpha')).toBe('1.0.1-alpha.0');
    });
  });

  describe('getNextVersion', () => {
    test('should bump the version if minimum change is met', () => {
      expect(getNextVersion('1.0.0', 'major', 'none', 'minor')).toBe('2.0.0');
      expect(getNextVersion('1.0.0', 'minor', 'none', 'patch')).toBe('1.1.0');
      expect(getNextVersion('1.0.0', 'patch', 'none', 'none')).toBe('1.0.1');
    })

    test('should bump to a pre-release version if minimum change is met', () => {
      expect(getNextVersion('1.0.0', 'major', 'alpha', 'minor')).toBe('2.0.0-alpha.0');
      expect(getNextVersion('1.0.0', 'minor', 'alpha', 'patch')).toBe('1.1.0-alpha.0');
      expect(getNextVersion('1.0.0', 'patch', 'alpha', 'none')).toBe('1.0.1-alpha.0');
      expect(getNextVersion('1.0.0', 'patch', 'alpha', 'patch')).toBe('1.0.1-alpha.0');
    });

    test('should bump to a pre-release version with a pre-release version if minimum change is met', () => {
      expect(getNextVersion('1.0.0-alpha.0', 'major', 'alpha', 'minor')).toBe('2.0.0-alpha.0');
      expect(getNextVersion('1.0.0-alpha.0', 'minor', 'alpha', 'patch')).toBe('1.1.0-alpha.0');
      expect(getNextVersion('1.0.0-alpha.0', 'patch', 'alpha', 'none')).toBe('1.0.1-alpha.0');
    });

    test('should not bump the version if minimum change is not met', () => {
      expect(getNextVersion('1.0.0', 'major', 'none', 'major')).toBe('1.0.0');
      expect(getNextVersion('1.0.0', 'minor', 'none', 'minor')).toBe('1.0.0');
      expect(getNextVersion('1.0.0', 'patch', 'none', 'patch')).toBe('1.0.0');
    });

    test('should only bump the pre-release build number if minimum change is not met', () => {
      expect(getNextVersion('2.0.0-alpha.0', 'major', 'alpha', 'major')).toBe('2.0.0-alpha.1');
      expect(getNextVersion('1.1.0-alpha.0', 'minor', 'alpha', 'minor')).toBe('1.1.0-alpha.1');
      expect(getNextVersion('1.0.1-alpha.0', 'patch', 'alpha', 'patch')).toBe('1.0.1-alpha.1');
      expect(getNextVersion('2.0.0-alpha.0', 'patch', 'alpha', 'minor')).toBe('2.0.0-alpha.1');
    });

  });

  describe('parseCommit', () => {
    const bumpTypes = {
      major: [],
      minor: ['feat'],
      patch: ['fix', 'perf', 'refactor'],
      patchAll: false,
    } satisfies bumpTypes;

    test('should parse a commit', () => {
      expect(parseCommit(bumpTypes, 'feat(test)!: add new feature')).toBe('major');
      expect(parseCommit(bumpTypes, 'feat: add new feature')).toBe('minor');
      expect(parseCommit(bumpTypes, 'fix: fix a bug')).toBe('patch');
      expect(parseCommit(bumpTypes, 'perf: improve performance')).toBe('patch');
      expect(parseCommit(bumpTypes, 'refactor: refactor code')).toBe('patch');
      expect(parseCommit(bumpTypes, 'chore: update dependencies')).toBe(null);
    });
  });
});
