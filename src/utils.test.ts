import { envForTransformPlugin, sortByLoc } from './utils';
import { builders, parse, TransformPluginBuilder } from '.';

describe('utils', function () {
  describe('envForTransformPlugin', () => {
    test('it return correct TransformPluginEnv instance if there is no plugin argument', function () {
      let { env } = envForTransformPlugin('{{foo-bar}}');

      expect(env.filePath).toEqual(undefined);
      expect(env.contents).toEqual('{{foo-bar}}');
      expect(env.parseOptions.srcName).toEqual(undefined);
    });

    test('it return correct TransformPluginEnv instance with  plugin argument', function () {
      let { env } = envForTransformPlugin({
        plugin: ((() => {}) as unknown) as TransformPluginBuilder,
        template: '{{foo-bar}}',
        filePath: 'foo',
      });

      expect(env.contents).toEqual('{{foo-bar}}');
      expect(env.filePath).toEqual('foo');
      expect(env.parseOptions.srcName).toEqual('foo');
    });

    test('it return correct TransformPluginEnv instance with ast as argument', function () {
      let { env } = envForTransformPlugin(parse('{{foo-bar}}'));

      expect(env.contents).toEqual('{{foo-bar}}');
      expect(env.filePath).toEqual(undefined);
      expect(env.parseOptions.srcName).toEqual(undefined);
    });

    test('it return correct TransformPluginEnv instance with ast as argument template param', function () {
      let { env } = envForTransformPlugin({
        plugin: ((() => {}) as unknown) as TransformPluginBuilder,
        template: parse('{{foo-bar}}'),
        filePath: 'foo',
      });

      expect(env.contents).toEqual('{{foo-bar}}');
      expect(env.filePath).toEqual('foo');
      expect(env.parseOptions.srcName).toEqual('foo');
    });
  });

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
