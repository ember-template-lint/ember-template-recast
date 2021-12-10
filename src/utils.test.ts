import { sortByLoc } from './utils';
import { builders } from '.';

describe('utils', function () {
  describe('sortByLoc', function () {
    test('sorts synthetic nodes last', function () {
      let a = builders.pair('a', builders.path('foo') /* no loc, "synthetic" */);
      let b = builders.pair('b', builders.path('foo'), builders.loc(1, 1, 1, 5, 'foo.hbs'));

      let actual = [a, b].sort(sortByLoc);

      expect(actual.map((i) => i.key)).toEqual(['a', 'b']);
    });

    test('sorts nodes by their line numbers', function () {
      let a = builders.pair('a', builders.path('foo'), builders.loc(1, 1, 1, 5, 'foo.hbs'));
      let b = builders.pair('b', builders.path('foo'), builders.loc(3, 1, 1, 5, 'foo.hbs'));
      let c = builders.pair('c', builders.path('foo'), builders.loc(2, 1, 1, 5, 'foo.hbs'));

      let actual = [b, a, c].sort(sortByLoc);

      expect(actual.map((i) => i.key)).toEqual(['a', 'c', 'b']);
    });

    test('when start line matches, sorts by starting column', function () {
      let a = builders.pair('a', builders.path('foo'), builders.loc(1, 1, 1, 5, 'foo.hbs'));
      let b = builders.pair('b', builders.path('foo'), builders.loc(2, 1, 1, 5, 'foo.hbs'));
      let c = builders.pair('c', builders.path('foo'), builders.loc(1, 6, 1, 9, 'foo.hbs'));

      let actual = [b, a, c].sort(sortByLoc);

      expect(actual.map((i) => i.key)).toEqual(['a', 'c', 'b']);
    });
  });
});
