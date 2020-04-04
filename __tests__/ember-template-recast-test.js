const execa = require('execa');
const { readFileSync } = require('fs');
const { join } = require('path');
const { createTempDir } = require('broccoli-test-helper');
const slash = require('slash');

function run(args, cwd) {
  return execa(require.resolve('../bin/ember-template-recast'), args, { cwd });
}

describe('ember-template-recast executable', function ({ beforeEach, afterEach }) {
  beforeEach(function () {
    return createTempDir().then((fixture) => {
      this.fixture = fixture;

      this.fixture.write({
        files: {
          'a.hbs': '{{hello-world}}',
          'b.handlebars': '{{more-mustache foo=bar}}',
          'unchanged.hbs': `nothing to do`,
        },
        'transform.js': readFileSync(join(__dirname, 'fixtures', 'wat-wat.js'), 'utf8'),
      });
    });
  });

  afterEach(function () {
    if (this.input) {
      return this.input.dispose();
    }
  });

  test('updating files', function (assert) {
    return run(['files', '-c', '1'], this.fixture.path()).then(({ stdout }) => {
      const out = this.fixture.read();

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

  test('dry run', function (assert) {
    return run(['files', '-c', '1', '-d'], this.fixture.path()).then(({ stdout }) => {
      const out = this.fixture.read();

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

  test('with a bad transform', function (assert) {
    this.fixture.write({
      'bad-transform.js': 'module.exports = syntax error',
    });

    return run(['files', '-t', 'bad-transform.js'], this.fixture.path()).then(({ stdout }) => {
      expect(stdout.includes('Error: Unexpected identifier')).toBeTruthy();
      expect(stdout.includes(join(this.fixture.path(), 'bad-transform.js'))).toBeTruthy();
    });
  });

  test('with a bad template', function (assert) {
    this.fixture.write({
      files: {
        'bad-template.hbs': `{{ not { valid (mustache) }`,
      },
    });

    return run(['files', '-c', '1'], this.fixture.path()).then(({ stdout }) => {
      const out = this.fixture.read();

      expect(stdout.includes(
        `Processing 4 files…
Spawning 1 worker…
Ok:        2
Unchanged: 1
Errored:   1`
      )).toBeTruthy();

      let badFilePath = slash(join(this.fixture.path(), 'files/bad-template.hbs'));

      assert.pushResult({
        result: stdout.includes(badFilePath),
        message: `Expected output to include full path to the invalid template (${badFilePath}): \n\n${stdout}`,
      });

      expect(stdout.includes('Error: Parse error on line 1:')).toBeTruthy();

      expect(out.files).toEqual({
        'a.hbs': '{{wat-wat}}',
        'b.handlebars': '{{wat-wat}}',
        'unchanged.hbs': `nothing to do`,
        'bad-template.hbs': `{{ not { valid (mustache) }`,
      });
    });
  });

  test('concurrency', function (assert) {
    const files = Array(300)
      .fill(1)
      .reduce((acc, _, i) => Object.assign(acc, { [`file${i}.hbs`]: '{{hello-world}}' }), {});

    this.fixture.write({
      'many-files': files,
    });

    return run(['many-files', '-c', '4'], this.fixture.path()).then(({ stdout }) => {
      expect(stdout).toEqual(`Processing 300 files…
Spawning 4 workers…
Ok:        300
Unchanged: 0`);

      const files = this.fixture.read();
      expect(files['many-files']['file199.hbs']).toEqual('{{wat-wat}}');
    });
  });
});
