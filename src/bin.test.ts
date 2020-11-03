import * as path from 'path';
import { existsSync } from 'fs';
import execa from 'execa';
import { join } from 'path';
import { createTempDir, TempDir } from 'broccoli-test-helper';
import slash from 'slash';

const COMPILED_BIN_PATH = path.join(__dirname, '../lib/bin.js');
if (!existsSync(COMPILED_BIN_PATH)) {
  throw new Error('Missing compiled output, run `yarn build`!');
}

function run(args: string[], cwd: string) {
  return execa(process.execPath, [COMPILED_BIN_PATH, ...args], {
    cwd,
  });
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
  let fixture: TempDir;

  beforeEach(async function () {
    fixture = await createTempDir();

    fixture.write({
      files: {
        'a.hbs': '{{hello-world}}',
        'b.handlebars': '{{more-mustache foo=bar}}',
        'unchanged.hbs': `nothing to do`,
      },
      'transform.js': transform,
    });
  });

  test('updating files', async function () {
    const { stdout } = await run(['files', '-c', '1'], fixture.path());
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

  test('dry run', async function () {
    const { stdout } = await run(['files', '-c', '1', '-d'], fixture.path());
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

  test('with a bad transform', async function () {
    fixture.write({
      'bad-transform.js': 'module.exports = syntax error',
    });

    try {
      await run(['files', '-t', 'bad-transform.js'], fixture.path());
    } catch ({ stdout }) {
      expect(stdout.includes('Error: Unexpected identifier')).toBeTruthy();
      expect(stdout.includes(join(fixture.path(), 'bad-transform.js'))).toBeTruthy();
    }
  });

  test('with a bad template', async function () {
    fixture.write({
      files: {
        'bad-template.hbs': `{{ not { valid (mustache) }`,
      },
    });

    const { stdout } = await run(['files', '-c', '1'], fixture.path());
    const out = fixture.read();
    expect(
      stdout.includes(`Processing 4 files…
Spawning 1 worker…
Ok:        2
Unchanged: 1
Errored:   1`)
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

  test('concurrency', async function () {
    const files = Array(300)
      .fill(1)
      .reduce((acc, _, i) => Object.assign(acc, { [`file${i}.hbs`]: '{{hello-world}}' }), {});

    fixture.write({
      'many-files': files,
    });

    const { stdout } = await run(['many-files', '-c', '4'], fixture.path());
    expect(stdout).toEqual(`Processing 300 files…
Spawning 4 workers…
Ok:        300
Unchanged: 0`);

    expect(fixture.readText('many-files/file199.hbs')).toEqual('{{wat-wat}}');
  });
});
