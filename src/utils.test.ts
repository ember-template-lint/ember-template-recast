import { sortByLoc, blockParamSource } from './utils';
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

  describe('blockParamSource', function () {
    describe('given an ElementNode', function () {
      test('returns the source of a simple block param', function () {
        const element = '<Component as |bar|></Component>';

        expect(blockParamSource(element)).toEqual('as |bar|');
      });

      test('returns the source of a block param while there is a named argument containing `as |foo|`', function () {
        const element = '<Component data-foo="as |foo|" as |bar|></Component>';

        expect(blockParamSource(element)).toEqual('as |bar|');
      });
    });

    describe('given a BlockStatement', function () {
      test('returns the source of a block param', function () {
        const block = '{{#BlockStatement as |bar|}}{{/BlockStatement}}';

        expect(blockParamSource(block)).toEqual('as |bar|');
      });

      test('returns the source of a block param while there is a named argument containing `as |foo|`', function () {
        const block = '{{#BlockStatement data-foo="as |foo|" as |bar|}}{{/BlockStatement}}';

        expect(blockParamSource(block)).toEqual('as |bar|');
      });
    });
  });
});
