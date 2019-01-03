const {
  preprocess,
  print: _print,
  traverse: _traverse,
  builders,
  Walker,
} = require('@glimmer/syntax');

const reLines = /(.*?(?:\r\n?|\n|$))/gm;

const PARSE_RESULT = Symbol('PARSE_RESULT');
const NEAREST_NODE_WITH_LOC = Symbol('NEAREST_NODE_WITH_LOC');
const CLONED_NEAREST_NODE_WITH_LOC = Symbol('CLONED_NEAREST_NODE_WITH_LOC');

function linesFrom(string) {
  // split the strip up by \n or \r\n
  let lines = string.match(reLines);

  // always insist on returning one line (since we always modify one line)
  // otherwise, lines might disappear!
  // (if it's whitespace-only after splicing in changes, we'll edit it out below)
  if (lines.length === 1) {
    return lines;
  }

  // the split above always results in an extra empty line at the end remove it
  return lines.slice(0, -1);
}

function wrapNode(node, parentNode, nearestNodeWithLoc, parseResult) {
  let propertyProxyMap = new Map();
  let clonedNearestNodeWithLoc = JSON.parse(JSON.stringify(nearestNodeWithLoc));

  let proxy = new Proxy(node, {
    get(target, property) {
      if (property === NEAREST_NODE_WITH_LOC) {
        return nearestNodeWithLoc;
      } else if (property === CLONED_NEAREST_NODE_WITH_LOC) {
        return clonedNearestNodeWithLoc;
      } else if (property === PARSE_RESULT) {
        return parseResult;
      }

      if (propertyProxyMap.has(property)) {
        return propertyProxyMap.get(property);
      }

      return Reflect.get(target, property);
    },

    set(target, property, value) {
      let original = clonedNearestNodeWithLoc;
      let updatedValue = nearestNodeWithLoc;

      if (propertyProxyMap.has(property)) {
        let propertyProxy = propertyProxyMap.get(property);
        original = propertyProxy[CLONED_NEAREST_NODE_WITH_LOC];
        updatedValue = propertyProxy[NEAREST_NODE_WITH_LOC];

        if (updatedValue === Reflect.get(target, property)) {
          updatedValue = value;
        }
      }

      Reflect.set(target, property, value);

      if (Array.isArray(target) && property === 'length') return true;

      if (node.type === 'ElementNode' && property === 'tag') {
        updatedValue = value;
        parseResult.modifications.push({
          start: {
            line: original.loc.start.line,
            column: original.loc.start.column + 1,
          },
          end: {
            line: original.loc.start.line,
            column: original.loc.start.column + 1 + original.tag.length,
          },
          value: updatedValue,
        });

        let start = {
          line: node.loc.end.line,
          column: node.loc.end.column - 1 - original.tag.length,
        };
        parseResult.modifications.push({
          start,
          end: {
            line: node.loc.end.line,
            column: node.loc.end.column - 1,
          },
          value: updatedValue,
        });
      } else {
        parseResult.modifications.push({
          start: original.loc.start,
          end: original.loc.end,
          value: updatedValue,
        });
      }

      if (property === 'path' && node.type === 'BlockStatement') {
        let start = {
          line: node.loc.end.line,
          column: node.loc.end.column - 2 - original.original.length,
        };
        parseResult.modifications.push({
          start,
          end: {
            line: node.loc.end.line,
            column: node.loc.end.column - 2,
          },
          value: updatedValue,
        });
      }

      return true;
    },
  });

  for (let key in node) {
    let value = node[key];
    if (typeof value === 'object' && value !== null) {
      let propertyProxy = wrapNode(
        value,
        node,
        value.loc ? value : node.loc ? node : nearestNodeWithLoc,
        parseResult
      );
      propertyProxyMap.set(key, propertyProxy);
    }
  }

  return proxy;
}

class ParseResult {
  constructor(template) {
    this.source = linesFrom(template);
    this.modifications = [];

    let ast = preprocess(template, { ignoreStandalone: true });
    this.ast = wrapNode(ast, null, ast, this);
  }

  applyModifications() {
    let { modifications } = this;
    this.modifications = Object.freeze([]);

    let sortedModifications = modifications
      .sort(function(a, b) {
        return a.start.line - b.start.line || a.start.column - b.start.column;
      })
      .reverse();

    sortedModifications.forEach(({ start, end, value }) => {
      let printed = typeof value === 'string' ? value : _print(value);
      let firstIndexToUpdate = start.line - 1;
      let lastIndexToUpdate = end.line - 1;
      let firstLineContents = this.source[firstIndexToUpdate];
      let lastLineContents = this.source[lastIndexToUpdate];
      let replacementLines = linesFrom(printed);

      let mergedReplacementLines = replacementLines.map((line, index) => {
        let isFirstLine = index === 0;
        let isLastLine = index === replacementLines.length - 1;
        let updatedLine = line;

        // We check for a couple of common error cases that can be introduced by line replacement...
        // 1) For one-line edits, if there is whitespace before and after the edited section
        //   (usually due to a removed prop), trim the preceeding whitespace before the edit.
        if (isFirstLine && isLastLine && firstLineContents && lastLineContents) {
          const hasPreceedingWhitespace = firstLineContents.slice(0, start.column).match(/\S+\s+$/);
          const hasTrailingWhitespace = lastLineContents.slice(end.column).match(/^\s+\S+/);

          if (hasPreceedingWhitespace && hasTrailingWhitespace) {
            // trimEnd() is as of Node 10, so we probably want to use replace() until Node < 10 is EOLd.
            updatedLine = firstLineContents.slice(0, start.column).replace(/\s+$/, '') + line;
          } else {
            updatedLine = firstLineContents.slice(0, start.column) + line;
          }
          updatedLine += lastLineContents.slice(end.column);
        } else {
          if (isFirstLine && firstLineContents) {
            updatedLine = firstLineContents.slice(0, start.column) + line;
          }
          if (isLastLine && lastLineContents) {
            updatedLine += lastLineContents.slice(end.column);
          }
        }

        // 2) If the only thing that's left on this line is whitespace, and we made a change, remove it.
        if (updatedLine.match(/\S/) === null && line !== updatedLine) {
          return null;
        }

        return updatedLine;
      });

      this.source.splice(
        firstIndexToUpdate,
        1 /* always replace at least one line */ + lastIndexToUpdate - firstIndexToUpdate,
        ...mergedReplacementLines
      );
    });
  }

  print() {
    this.applyModifications();

    return this.source.join('');
  }
}

function parse(template) {
  return new ParseResult(template).ast;
}

function print(ast) {
  let parseResult = ast[PARSE_RESULT];
  return parseResult.print();
}

function transform(template, plugin) {
  let ast;
  if (typeof template === 'string') {
    ast = parse(template);
  } else {
    // assume we were passed an ast
    ast = template;
  }
  let syntax = {
    parse,
    builders,
    print,
    traverse: _traverse,
    Walker,
  };
  let env = { syntax };
  let visitor = plugin(env);
  _traverse(ast, visitor);
  return { ast, code: print(ast) };
}

module.exports = {
  parse,
  print,
  transform,
};
