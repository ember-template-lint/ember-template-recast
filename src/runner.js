const http = require('http');
const https = require('https');
const { writeFileSync } = require('fs');
const { resolve } = require('path');
const colors = require('colors/safe');
const slash = require('slash');
const globby = require('globby');
const ora = require('ora');
const queue = require('async-promise-queue');
const tmp = require('tmp');
const workerpool = require('workerpool');

tmp.setGracefulCleanup();

class NoFilesError extends Error {}

const silentLogger = {
  info() {},
  warning() {},
  error() {},
  spin() {},
  updateSpinner() {},
  stopSpinner() {},
};

/* eslint-disable no-console */
const verboseLogger = {
  info(message) {
    console.log(message);
  },
  warning(message) {
    console.log(`${colors.white.bgYellow(' WARN ')} ${message}`);
  },
  error(message) {
    console.log(`${colors.white.bgRed(' ERR ')} ${message}`);
  },
  spin(message) {
    this.spinner = ora(message).start();
  },
  updateSpinner(message) {
    if (this.spinner) {
      this.spinner.text = message;
    }
  },
  stopSpinner(persistentMessage) {
    if (persistentMessage) {
      this.spinner && this.spinner.stopAndPersist(persistentMessage);
    } else {
      this.spinner && this.spinner.stop();
    }
  },
};
/* eslint-enable no-console */

class StatsCollector {
  constructor(logger) {
    this.logger = logger;
    this.changed = 0;
    this.unchanged = 0;
    this.skipped = 0;
    this.errors = [];
  }

  update(message) {
    switch (message.type) {
      case 'update':
        switch (message.status) {
          case 'ok':
            this.changed++;
            break;
          case 'skipped':
            this.skipped++;
            break;
          default:
            this.unchanged++;
            break;
        }
        break;

      case 'error':
        this.errors.push(message);
        break;
    }
  }

  print() {
    this.logger.info(`Ok:        ${this.changed}`);
    this.logger.info(`Unchanged: ${this.unchanged}`);

    if (this.skipped) {
      this.logger.info(`Skipped:   ${this.skipped}`);
    }

    if (this.errors.length) {
      this.logger.info(`Errored:   ${this.errors.length}`);

      this.errors.slice(0, 5).forEach(({ file, error }) => {
        this.logger.error(`${file}`);
        handleError(error, this.logger);
      });

      if (this.errors.length > 5) {
        const more = this.errors.length - 5;
        this.logger.error(`And ${more} more error${more !== 1 ? 's' : ''}`);
      }
    }
  }
}

module.exports = async function run(transformFile, filePaths, options) {
  const logger = options.silent ? silentLogger : verboseLogger;
  const stats = new StatsCollector(logger);

  try {
    const [transformPath, files] = await Promise.all([
      loadTransform(transformFile),
      getAllFiles(filePaths),
    ]);

    await spawnWorkers(transformPath, files, options, stats, logger);

    logger.stopSpinner({
      symbol: '🎉',
      text: 'Complete!',
    });
    stats.print();
  } catch (err) {
    logger.stopSpinner();
    handleError(err, logger);
  }
};

/**
 * Returns the location of the transform module on disk.
 * @param {string} transformFile
 * @returns {Promise<string>}
 */
async function loadTransform(transformFile) {
  const isRemote = transformFile.startsWith('http');

  if (!isRemote) {
    return resolve(process.cwd(), transformFile);
  }

  const contents = await downloadFile(transformFile);
  const filePath = tmp.fileSync();

  writeFileSync(filePath.name, contents, 'utf8');

  return filePath.name;
}

/**
 * @param {string} url
 * @returns {Promise<string>}
 */
function downloadFile(url) {
  return new Promise((resolve, reject) => {
    const transport = url.startsWith('https') ? https : http;

    let contents = '';
    transport
      .get(url, (res) =>
        res.on('data', (data) => (contents += data.toString())).on('end', () => resolve(contents))
      )
      .on('error', (err) => reject(err));
  });
}

/**
 * Convert array of paths into an array of absolute file paths. Uses globby
 * under the hood so it respects .gitignore files.
 * @param {string[]} paths
 * @returns {Promise<string[]>}
 */
async function getAllFiles(paths) {
  const files = await globby(paths, {
    // must specify a properly escaped `cwd` because globby infers from
    // process.cwd() directly and without correcting back to posix paths
    // asserts if the individual file path isn't "in" the cwd
    // https://github.com/sindresorhus/globby/pull/137
    cwd: slash(process.cwd()),
    expandDirectories: {
      extensions: ['hbs', 'handlebars'],
    },
    absolute: true,
    gitignore: true,
  });
  if (files.length < 1) {
    throw new NoFilesError();
  }

  return files;
}

/**
 * Divides files into chunks and distributes them across worker processes.
 * @param {string} transformPath
 * @param {string[]} files
 * @param {number} options.cpus
 * @param {boolean} options.dry
 * @param {StatsCollector} stats
 * @param {Logger} logger
 * @returns {Promise<void>}
 */
async function spawnWorkers(transformPath, files, { cpus, dry }, stats, logger) {
  const processCount = Math.min(files.length, cpus);

  logger.info(`Processing ${files.length} file${files.length !== 1 ? 's' : ''}…`);
  logger.info(`Spawning ${processCount} worker${processCount !== 1 ? 's' : ''}…`);

  logger.spin('Processed 0 files');

  const pool = workerpool.pool(require.resolve('./worker.js'), { maxWorkers: cpus });

  let i = 0;
  const worker = queue.async.asyncify(async (file) => {
    const message = await pool.exec('run', [transformPath, file, { dry }]);

    stats.update(message);
    logger.updateSpinner(`Processed ${i++} files`);
  });

  try {
    await queue(worker, files, cpus);
  } finally {
    pool.terminate();
  }
}

function handleError(err, logger) {
  if (err.code === 'MODULE_NOT_FOUND') {
    logger.error('Transform plugin not found');
  } else if (err instanceof NoFilesError) {
    logger.error('No files matched');
  } else {
    logger.error(err);
    if (err.stack) {
      logger.error(err.stack);
    }
  }
  return 1;
}
