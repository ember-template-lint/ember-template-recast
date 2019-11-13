const { sortByLoc } = require('../src/utils');
const { builders } = require('@glimmer/syntax');

QUnit.module('utils', function() {
  QUnit.module('sortByLoc', function() {
    QUnit.test('sorts synthetic nodes last', function(assert) {
      let a = builders.pair('a', builders.path('foo') /* no loc, "synthetic" */);
      let b = builders.pair('b', builders.path('foo'), builders.loc(1, 1, 1, 5, 'foo.hbs'));

      let actual = [a, b].sort(sortByLoc);

      assert.deepEqual(
        actual.map(i => i.key),
        ['b', 'a']
      );
    });

    QUnit.test('sorts nodes by their line numbers', function(assert) {
      let a = builders.pair('a', builders.path('foo'), builders.loc(1, 1, 1, 5, 'foo.hbs'));
      let b = builders.pair('b', builders.path('foo'), builders.loc(3, 1, 1, 5, 'foo.hbs'));
      let c = builders.pair('c', builders.path('foo'), builders.loc(2, 1, 1, 5, 'foo.hbs'));

      let actual = [b, a, c].sort(sortByLoc);

      assert.deepEqual(
        actual.map(i => i.key),
        ['a', 'c', 'b']
      );
    });

    QUnit.test('when start line matches, sorts by starting column', function(assert) {
      let a = builders.pair('a', builders.path('foo'), builders.loc(1, 1, 1, 5, 'foo.hbs'));
      let b = builders.pair('b', builders.path('foo'), builders.loc(2, 1, 1, 5, 'foo.hbs'));
      let c = builders.pair('c', builders.path('foo'), builders.loc(1, 6, 1, 9, 'foo.hbs'));

      let actual = [b, a, c].sort(sortByLoc);

      assert.deepEqual(
        actual.map(i => i.key),
        ['a', 'c', 'b']
      );
    });
  });
});
