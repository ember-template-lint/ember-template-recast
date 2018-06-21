const { fork } = require('child_process');
const { resolve, extname, join } = require('path');
const colors = require('colors/safe');
const globby = require('globby');

class NoFilesError extends Error {}

const silentLogger = {
  info() {},
  warning() {},
  error() {},
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
};
/* eslint-enable no-console */

class StatsCollector {
  constructor(logger) {
    this.logger = logger;
    this.changed = 0;
    this.unchanged = 0;
    this.skipped = 0;
    this.errors = [];
    this.loadError = null;
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

      case 'loadError':
        this.loadError = message.error;
        break;

      case 'error':
        this.errors.push(message);
        break;
    }
  }

  print() {
    if (this.loadError) {
      this.logger.error(this.loadError);
      return;
    }

    this.logger.info(`Ok:        ${this.changed}`);
    this.logger.info(`Unchanged: ${this.unchanged}`);

    if (this.skipped) {
      this.logger.info(`Skipped:   ${this.skipped}`);
    }

    if (this.errors.length) {
      this.logger.info(`Errored:   ${this.errored}`);

      this.errors.slice(0, 5).forEach(({ file, error }) => {
        this.logger.error(`${file}`);
        this.logger.error(error);
      });

      if (this.errors.length > 5) {
        const more = this.errors.length - 5;
        this.logger.error(`And ${more} more error${more !== 1 ? 's' : ''}`);
      }
    }
  }
}

module.exports = function run(transformFile, filePaths, options) {
  const logger = options.silent ? silentLogger : verboseLogger;
  const stats = new StatsCollector(logger);

  return Promise.all([loadTransform(transformFile), getAllFiles(filePaths)])
    .then(([transformPath, files]) => spawnWorkers(transformPath, files, options, stats, logger))
    .then(() => stats.print())
    .catch(err => handleError(err, logger));
};

/**
 * TODO: Support loading remote files.
 * @param {string} transformFile
 * @returns {Promise<string>}
 */
function loadTransform(transformFile) {
  return resolve(process.cwd(), transformFile);
}

/**
 * Convert array of paths into an array of absolute file paths. Uses globby
 * under the hood so it respects .gitignore files.
 * @param {string[]} paths
 * @returns {Promise<string[]>}
 */
function getAllFiles(paths) {
  const patterns = paths.map(path => {
    const ext = extname(path);
    if (ext === '') {
      path = join(path, '**', '*.{hbs,handlebars}');
    }

    return path;
  });

  return globby(patterns, { absolute: true }).then(files => {
    if (files.length < 1) {
      throw new NoFilesError();
    }

    return files;
  });
}

/**
 * Divides files into chunks and distributes them across worker processes. When
 * workers send back messages, we either collect stats for display at the end
 * or send the worker more files.
 * @param {string} transformPath
 * @param {string[]} files
 * @param {number} options.cpus
 * @param {boolean} options.dry
 * @param {StatsCollector} stats
 * @param {Logger} logger
 * @returns {Promise<void>}
 */
function spawnWorkers(transformPath, files, { cpus, dry }, stats, logger) {
  logger.info(`Processing ${files.length} file${files.length !== 1 ? 's' : ''}…`);

  const chunkSize = Math.min(50, Math.ceil(files.length / cpus) + 1);
  const chunkCount = Math.max(Math.ceil(files.length / chunkSize), 1);
  const processCount = Math.min(chunkCount, cpus);

  let index = 0;
  function next() {
    return files.slice(index, (index += chunkSize));
  }

  function send(worker) {
    const nextChunk = next();

    if (nextChunk.length) {
      logger.info(
        `Sending ${nextChunk.length} file${nextChunk.length !== 1 ? 's' : ''} to worker…`
      );
    }

    // always send a message to the worker. an empty `files` array tells the
    // worker that it can disconnect.
    worker.send({ files: nextChunk, options: { dry } });
  }

  logger.info(`Spawning ${processCount} worker${processCount !== 1 ? 's' : ''}`);
  const workers = Array(processCount)
    .fill(1)
    .map(() => fork(require.resolve('./worker'), [transformPath]));

  const workerPromises = workers.map(worker => {
    send(worker);

    worker.on('message', message => {
      switch (message.type) {
        case 'waiting':
          send(worker);
          break;
        default:
          stats.update(message);
      }
    });

    return new Promise(resolve => worker.on('disconnect', resolve));
  });

  return Promise.all(workerPromises);
}

function handleError(err, logger) {
  if (err instanceof NoFilesError) {
    logger.error('No files matched');
  } else {
    logger.error(err);
  }
  return 1;
}
