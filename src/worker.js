const fs = require('fs');
const { parse, transform } = require('./index');

/**
 * @typedef TransformResult
 * @property {boolean} changed
 * @property {boolean} skipped
 * @property {string} source
 */

/**
 * @typedef TransformOptions
 * @property {boolean} dry
 */

class ProcessAPI {
  constructor(transformPath) {
    try {
      const module = require(transformPath);
      this.plugin = typeof module.default === 'function' ? module.default : module;
    } catch (e) {
      this.notify('loadError', { error: e.stack });
      this.finish();
    }

    process.on('message', data => this.run(data));
  }

  run(data) {
    run(this.plugin, data.files, data.options, this);
  }

  notify(type, data = {}) {
    process.send(Object.assign({ type }, data));
  }

  fileUpdate(file, status) {
    this.notify('update', { file, status });
  }

  error(file, error) {
    this.notify('error', { file, error });
  }

  free() {
    this.notify('waiting');
  }

  finish() {
    setImmediate(() => process.disconnect());
  }
}

new ProcessAPI(process.argv[2]);

/**
 * @param {Function} plugin
 * @param {string[]} files
 * @param {TransformOptions} options
 * @param {ProcessAPI} api
 */
function run(plugin, files, options, api) {
  if (files.length < 1) {
    api.finish();
    return;
  }

  const operations = files.map(file =>
    readFile(file)
      .then(contents => applyTransform(plugin, file, contents))
      .then(output => writeFile(file, output, options))
      .then(output =>
        api.fileUpdate(file, output.skipped ? 'skipped' : output.changed ? 'ok' : 'nochange')
      )
      .catch(error => api.error(file, error.stack))
  );

  Promise.all(operations).then(() => api.free());
}

/**
 * @param {string} filePath
 * @returns {Promise<string>}
 */
function readFile(filePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, 'utf8', (err, contents) => {
      err ? reject(err) : resolve(contents);
    });
  });
}

/**
 * @param {Function} plugin
 * @param {string} filePath
 * @param {string} contents
 * @returns {TransformResult}
 */
function applyTransform(plugin, filePath, contents) {
  const code = plugin(
    {
      path: filePath,
      source: contents,
    },
    {
      parse,
      visit(ast, callback) {
        const results = transform(ast, callback);
        return results && results.code;
      },
    }
  );

  return {
    skipped: !code,
    changed: code !== contents,
    source: code,
  };
}

/**
 *
 * @param {string} filePath
 * @param {TransformResult} output
 * @param {TransformOptions} options
 * @returns {Promise<TransformResult>}
 */
function writeFile(filePath, output, options) {
  const { changed, source } = output;

  if (options.dry || !changed) {
    return output;
  }

  return new Promise((resolve, reject) => {
    fs.writeFile(filePath, source, 'utf8', err => {
      err ? reject(err) : resolve(output);
    });
  });
}
