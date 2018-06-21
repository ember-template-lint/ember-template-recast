#!/usr/bin/env node

const os = require('os');
const nomnom = require('nomnom');
const pkg = require('../package.json');
const run = require('../src/runner');

const opts = nomnom
  .script('ember-template-recast')
  .options({
    paths: {
      position: 0,
      help: 'Files or directories to transform',
      list: true,
      metavar: 'FILE',
      required: true,
    },
    transform: {
      abbr: 't',
      default: './transform.js',
      help: 'Path to the transform file. Can be either a local path or url',
      metavar: 'FILE',
    },
    cpus: {
      abbr: 'c',
      help: 'Determines the number of processes started.',
      default: Math.max(os.cpus().length - 1, 1),
    },
    dry: {
      abbr: 'd',
      flag: true,
      help: 'Dry run (no changes are made to files)',
    },
    silent: {
      abbr: 's',
      flag: true,
      default: false,
      full: 'silent',
      help: 'No output',
    },
    version: {
      flag: true,
      help: 'Print version and exit',
      callback: function() {
        return `ember-template-recast: ${pkg.version}`;
      },
    },
  })
  .parse();

run(opts.transform, opts.paths, opts).then(process.exit);
