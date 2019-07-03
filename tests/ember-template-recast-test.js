const { spawn } = require('child_process');
const { readFileSync } = require('fs');
const { join } = require('path');
const { createTempDir } = require('broccoli-test-helper');

function run(args, cwd) {
  return new Promise(resolve => {
    const recast = spawn(join(__dirname, '../bin/ember-template-recast.js'), args, { cwd });

    const out = { stdout: '', stderr: '' };
    recast.stdout.on('data', data => (out.stdout += data));
    recast.stderr.on('data', data => (out.stderr += data));

    recast.on('close', () => resolve(out));
  });
}

QUnit.module('ember-template-recast adding "this" to properties in PathExpression', function(
  hooks
) {
  hooks.beforeEach(function() {
    return createTempDir().then(fixture => {
      this.fixture = fixture;

      this.fixture.write({
        files: {
          'a.hbs': '{{hello-world property}}',
        },
        'transform.js': readFileSync(join(__dirname, 'fixtures', 'add-this.js'), 'utf8'),
      });
    });
  });

  hooks.afterEach(function() {
    if (this.input) {
      return this.input.dispose();
    }
  });

  QUnit.test('updates the file', function(assert) {
    return run(['files', '-c', '1'], this.fixture.path()).then(({ stdout }) => {
      const out = this.fixture.read();

      assert.equal(
        stdout,
        `Processing 3 files…
Spawning 1 worker…
Ok:        1
Unchanged: 0
`
      );

      assert.deepEqual(out.files, {
        'a.hbs': '{{hello-world this.property}}',
      });
    });
  });
});

QUnit.module('ember-template-recast executable', function({ beforeEach, afterEach }) {
  beforeEach(function() {
    return createTempDir().then(fixture => {
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

  afterEach(function() {
    if (this.input) {
      return this.input.dispose();
    }
  });

  QUnit.test('updating files', function(assert) {
    return run(['files', '-c', '1'], this.fixture.path()).then(({ stdout }) => {
      const out = this.fixture.read();

      assert.equal(
        stdout,
        `Processing 3 files…
Spawning 1 worker…
Ok:        2
Unchanged: 1
`
      );

      assert.deepEqual(out.files, {
        'a.hbs': '{{wat-wat}}',
        'b.handlebars': '{{wat-wat}}',
        'unchanged.hbs': 'nothing to do',
      });
    });
  });

  QUnit.test('dry run', function(assert) {
    return run(['files', '-c', '1', '-d'], this.fixture.path()).then(({ stdout }) => {
      const out = this.fixture.read();

      assert.equal(
        stdout,
        `Processing 3 files…
Spawning 1 worker…
Ok:        2
Unchanged: 1
`
      );

      assert.deepEqual(out.files, {
        'a.hbs': '{{hello-world}}',
        'b.handlebars': '{{more-mustache foo=bar}}',
        'unchanged.hbs': `nothing to do`,
      });
    });
  });

  QUnit.test('with a bad transform', function(assert) {
    this.fixture.write({
      'bad-transform.js': 'module.exports = syntax error',
    });

    return run(['files', '-t', 'bad-transform.js'], this.fixture.path()).then(({ stdout }) => {
      assert.ok(stdout.includes('Error: Unexpected identifier'), 'Output includes error message');
      assert.ok(
        stdout.includes(join(this.fixture.path(), 'bad-transform.js')),
        'Output includes full path to transform'
      );
    });
  });

  QUnit.test('with a bad template', function(assert) {
    this.fixture.write({
      files: {
        'bad-template.hbs': `{{ not { valid (mustache) }`,
      },
    });

    return run(['files', '-c', '1'], this.fixture.path()).then(({ stdout }) => {
      const out = this.fixture.read();

      assert.ok(
        stdout.includes(
          `Processing 4 files…
Spawning 1 worker…
Ok:        2
Unchanged: 1
Errored:   1
`
        ),
        'Status message includes error count'
      );

      assert.ok(
        stdout.includes(join(this.fixture.path(), 'files/bad-template.hbs')),
        'Output includes full path to bad template'
      );
      assert.ok(
        stdout.includes('Error: Parse error on line 1:'),
        'Output includes error stacktrace'
      );

      assert.deepEqual(out.files, {
        'a.hbs': '{{wat-wat}}',
        'b.handlebars': '{{wat-wat}}',
        'unchanged.hbs': `nothing to do`,
        'bad-template.hbs': `{{ not { valid (mustache) }`,
      });
    });
  });

  QUnit.test('concurrency', function(assert) {
    const files = Array(300)
      .fill(1)
      .reduce((acc, _, i) => Object.assign(acc, { [`file${i}.hbs`]: '{{hello-world}}' }), {});

    this.fixture.write({
      'many-files': files,
    });

    return run(['many-files', '-c', '4'], this.fixture.path()).then(({ stdout }) => {
      assert.equal(
        stdout,
        `Processing 300 files…
Spawning 4 workers…
Ok:        300
Unchanged: 0
`
      );

      const files = this.fixture.read();
      assert.equal(files['many-files']['file199.hbs'], '{{wat-wat}}');
    });
  });
});
