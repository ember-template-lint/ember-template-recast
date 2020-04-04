#!/usr/bin/env node

const os = require('os');
const program = require('commander');
const pkg = require('../package.json');
const run = require('../src/runner');

program
  .version(pkg.version)
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

if (program.args.length < 1 || !program.transform) {
  program.help();
} else {
  run(program.transform, program.args, program).then(process.exit);
}
