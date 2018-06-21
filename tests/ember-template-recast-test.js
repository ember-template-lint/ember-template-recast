const { spawn } = require('child_process');
const { readFileSync } = require('fs');
const { join } = require('path');
const tmp = require('tmp');
const fixturify = require('fixturify');

tmp.setGracefulCleanup();

class Fixture {
  constructor(obj) {
    this.tmp = tmp.dirSync();
    if (obj) {
      this.write(obj);
    }
  }

  get path() {
    return this.tmp.name;
  }

  write(obj) {
    fixturify.writeSync(this.path, obj);
  }

  read(options) {
    return fixturify.readSync(this.path, options);
  }
}

function run(args, cwd) {
  return new Promise(resolve => {
    const recast = spawn(join(__dirname, '../bin/ember-template-recast.js'), args, { cwd });

    const out = { stdout: '', stderr: '' };
    recast.stdout.on('data', data => (out.stdout += data));
    recast.stderr.on('data', data => (out.stderr += data));

    recast.on('close', () => resolve(out));
  });
}

QUnit.module('ember-template-recast executable', function() {
  QUnit.test('--version', function(assert) {
    return run(['--version']).then(({ stdout }) => {
      assert.ok(stdout.match(/ember-template-recast: [\d.]+/));
    });
  });

  QUnit.module('transforming files in place', function({ beforeEach }) {
    beforeEach(function() {
      this.fixture = new Fixture({
        files: {
          'a.hbs': '{{hello-world}}',
          'b.handlebars': '{{more-mustache foo=bar}}',
          'unchanged.hbs': `nothing to do`,
        },
        'transform.js': readFileSync(join(__dirname, 'fixtures', 'wat-wat.js'), 'utf8'),
      });
    });

    QUnit.test('updating files', function(assert) {
      return run(['files', '-c', '1'], this.fixture.path).then(({ stdout }) => {
        const out = this.fixture.read();

        assert.equal(
          stdout,
          `Processing 3 files…
Spawning 1 worker
Sending 3 files to worker…
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
      return run(['files', '-c', '1', '-d'], this.fixture.path).then(({ stdout }) => {
        const out = this.fixture.read();

        assert.equal(
          stdout,
          `Processing 3 files…
Spawning 1 worker
Sending 3 files to worker…
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

      return run(['files', '-t', 'bad-transform.js'], this.fixture.path).then(({ stdout }) => {
        assert.ok(stdout.includes('SyntaxError: Unexpected identifier'));
      });
    });

    QUnit.test('concurrency', function(assert) {
      const files = Array(300)
        .fill(1)
        .reduce((acc, _, i) => Object.assign(acc, { [`file${i}.hbs`]: '{{hello-world}}' }), {});

      this.fixture.write({
        'many-files': files,
      });

      return run(['many-files', '-c', '4'], this.fixture.path).then(({ stdout }) => {
        assert.equal(
          stdout,
          `Processing 300 files…
Spawning 4 workers
Sending 50 files to worker…
Sending 50 files to worker…
Sending 50 files to worker…
Sending 50 files to worker…
Sending 50 files to worker…
Sending 50 files to worker…
Ok:        300
Unchanged: 0
`
        );

        const files = this.fixture.read();
        assert.equal(files['many-files']['file199.hbs'], '{{wat-wat}}');
      });
    });
  });
});
