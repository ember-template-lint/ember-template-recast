const fs = require('fs');
const workerpool = require('workerpool');
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

/**
 * @param {string} transformPath
 * @param {string} filePath
 * @param {TransformOptions} options
 */
function run(transformPath, filePath, options) {
  const module = require(transformPath);
  const plugin = typeof module.default === 'function' ? module.default : module;

  return readFile(filePath)
    .then((contents) => applyTransform(plugin, filePath, contents))
    .then((output) => writeFile(filePath, output, options))
    .then((output) => ({
      type: 'update',
      file: filePath,
      status: output.skipped ? 'skipped' : output.changed ? 'ok' : 'nochange',
    }))
    .catch((err) => ({
      type: 'error',
      file: filePath,
      error: err.stack,
    }));
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
    fs.writeFile(filePath, source, 'utf8', (err) => {
      err ? reject(err) : resolve(output);
    });
  });
}

workerpool.worker({
  run,
});
