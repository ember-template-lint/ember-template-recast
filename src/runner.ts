import * as http from 'http';
import * as https from 'https';
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import colors from 'colors/safe';
import slash from 'slash';
import globby from 'globby';
import ora from 'ora';
import queue from 'async-promise-queue';
import tmp from 'tmp';
import workerpool from 'workerpool';

tmp.setGracefulCleanup();

class NoFilesError extends Error {}

class SilentLogger {
  info() {}
  warning() {}
  error() {}
  spin() {}
  updateSpinner() {}
  stopSpinner() {}
}

/* eslint-disable no-console */
class VerboseLogger {
  private spinner: any;

  info(message: string) {
    console.log(message);
  }

  warning(message: string) {
    console.log(`${(colors.white as any).bgYellow(' WARN ')} ${message}`);
  }

  error(message: string) {
    console.log(`${(colors.white as any).bgRed(' ERR ')} ${message}`);
  }

  spin(message: string) {
    this.spinner = ora(message).start();
  }

  updateSpinner(message: string) {
    if (this.spinner) {
      this.spinner.text = message;
    }
  }

  stopSpinner(persistentMessage?: string | { symbol: string; text: string }) {
    if (persistentMessage) {
      this.spinner && this.spinner.stopAndPersist(persistentMessage);
    } else {
      this.spinner && this.spinner.stop();
    }
  }
}
/* eslint-enable no-console */

type Logger = VerboseLogger | SilentLogger;

class StatsCollector {
  private logger: VerboseLogger | SilentLogger;
  public changed = 0;
  public unchanged = 0;
  public skipped = 0;
  public errors: any[] = [];

  constructor(logger: VerboseLogger | SilentLogger) {
    this.logger = logger;
  }

  update(message: any) {
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

export default async function run(
  transformFile: string,
  filePaths: string[],
  options: { silent?: boolean; cpus: number }
): Promise<void> {
  const logger = options.silent ? new SilentLogger() : new VerboseLogger();
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
    process.exitCode = 1;
    handleError(err, logger);
  }
}

/**
 * Returns the location of the transform module on disk.
 */
async function loadTransform(transformFile: string): Promise<string> {
  const isRemote = transformFile.startsWith('http');

  if (!isRemote) {
    return resolve(process.cwd(), transformFile);
  }

  const contents = await downloadFile(transformFile);
  const filePath = tmp.fileSync();

  writeFileSync(filePath.name, contents, 'utf8');

  return filePath.name;
}

function downloadFile(url: string): Promise<string> {
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
 */
async function getAllFiles(paths: string[]): Promise<string[]> {
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
 */
async function spawnWorkers(
  transformPath: string,
  files: string[],
  { cpus, dry = false }: { silent?: boolean; cpus: number; dry?: boolean },
  stats: StatsCollector,
  logger: Logger
): Promise<void> {
  const processCount = Math.min(files.length, cpus);

  logger.info(`Processing ${files.length} file${files.length !== 1 ? 's' : ''}…`);
  logger.info(`Spawning ${processCount} worker${processCount !== 1 ? 's' : ''}…`);

  logger.spin('Processed 0 files');

  const pool = workerpool.pool(require.resolve('./worker'), { maxWorkers: cpus });

  let i = 0;
  const worker = (queue as any).async.asyncify(async (file: string) => {
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

function handleError(err: any, logger: Logger): void {
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
}
