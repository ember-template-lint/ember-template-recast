#!/usr/bin/env node

import * as os from 'os';
import { readFileSync } from 'fs';
import { program } from 'commander';
import run from './runner.js';

const version = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), { encoding: 'utf-8' })
);
program
  .version(version)
  .usage('<files> -t transform-plugin.js')
  .option(
    '-t, --transform <file>',
    'path to the transform file. Can be either a local path or url',
    './transform.js'
  )
  .option(
    '-c, --cpus <count>',
    'determines the number of processes started.',
    (n) => parseInt(n, 10),
    Math.max(os.cpus().length - 1, 1)
  )
  .option('-d, --dry', 'dry run: no changes are made to files', false)
  .option('-s, --silent', 'no output', false)
  .parse(process.argv);

const programOptions = program.opts();
if (program.args.length < 1 || !programOptions.transform) {
  program.help();
} else {
  const options = {
    cpus: programOptions.cpus,
    dry: programOptions.dry,
    silent: programOptions.silent,
  };

  run(programOptions.transform, program.args, options);
}
