const execa = require('execa');
const { readFileSync } = require('fs');
const { join } = require('path');
const { createTempDir } = require('broccoli-test-helper');
const slash = require('slash');

function run(args, cwd) {
  return execa(require.resolve('../bin/ember-template-recast'), args, { cwd });
}

const transform = `
module.exports = function ({ source }, { parse, visit }) {
  const ast = parse(source);

  return visit(ast, (env) => {
    let { builders: b } = env.syntax;

    return {
      MustacheStatement() {
        return b.mustache(b.path('wat-wat'));
      },
    };
  });
};
`;

describe('ember-template-recast executable', function () {
  let fixture, input;

  beforeEach(function () {
    return createTempDir().then((_fixture) => {
      fixture = _fixture;

      fixture.write({
        files: {
          'a.hbs': '{{hello-world}}',
          'b.handlebars': '{{more-mustache foo=bar}}',
          'unchanged.hbs': `nothing to do`,
        },
        'transform.js': transform,
      });
    });
  });

  test('updating files', function () {
    return run(['files', '-c', '1'], fixture.path()).then(({ stdout }) => {
      const out = fixture.read();

      expect(stdout).toEqual(`Processing 3 files…
Spawning 1 worker…
Ok:        2
Unchanged: 1`);

      expect(out.files).toEqual({
        'a.hbs': '{{wat-wat}}',
        'b.handlebars': '{{wat-wat}}',
        'unchanged.hbs': 'nothing to do',
      });
    });
  });

  test('dry run', function () {
    return run(['files', '-c', '1', '-d'], fixture.path()).then(({ stdout }) => {
      const out = fixture.read();

      expect(stdout).toEqual(`Processing 3 files…
Spawning 1 worker…
Ok:        2
Unchanged: 1`);

      expect(out.files).toEqual({
        'a.hbs': '{{hello-world}}',
        'b.handlebars': '{{more-mustache foo=bar}}',
        'unchanged.hbs': `nothing to do`,
      });
    });
  });

  test('with a bad transform', function () {
    fixture.write({
      'bad-transform.js': 'module.exports = syntax error',
    });

    return run(['files', '-t', 'bad-transform.js'], fixture.path()).then(({ stdout }) => {
      expect(stdout.includes('Error: Unexpected identifier')).toBeTruthy();
      expect(stdout.includes(join(fixture.path(), 'bad-transform.js'))).toBeTruthy();
    });
  });

  test('with a bad template', function () {
    fixture.write({
      files: {
        'bad-template.hbs': `{{ not { valid (mustache) }`,
      },
    });

    return run(['files', '-c', '1'], fixture.path()).then(({ stdout }) => {
      const out = fixture.read();

      expect(
        stdout.includes(
          `Processing 4 files…
Spawning 1 worker…
Ok:        2
Unchanged: 1
Errored:   1`
        )
      ).toBeTruthy();

      let badFilePath = slash(join(fixture.path(), 'files/bad-template.hbs'));

      expect(stdout).toEqual(expect.stringContaining(badFilePath));

      expect(stdout.includes('Error: Parse error on line 1:')).toBeTruthy();

      expect(out.files).toEqual({
        'a.hbs': '{{wat-wat}}',
        'b.handlebars': '{{wat-wat}}',
        'unchanged.hbs': `nothing to do`,
        'bad-template.hbs': `{{ not { valid (mustache) }`,
      });
    });
  });

  test('concurrency', function () {
    const files = Array(300)
      .fill(1)
      .reduce((acc, _, i) => Object.assign(acc, { [`file${i}.hbs`]: '{{hello-world}}' }), {});

    fixture.write({
      'many-files': files,
    });

    return run(['many-files', '-c', '4'], fixture.path()).then(({ stdout }) => {
      expect(stdout).toEqual(`Processing 300 files…
Spawning 4 workers…
Ok:        300
Unchanged: 0`);

      const files = fixture.read();
      expect(files['many-files']['file199.hbs']).toEqual('{{wat-wat}}');
    });
  });
});
