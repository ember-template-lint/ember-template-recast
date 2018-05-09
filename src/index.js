const { preprocess, print: _print } = require('@glimmer/syntax');

const reLines = /(.*?(?:\r\n?|\n|$))/gm;

const PARSE_RESULT = Symbol('PARSE_RESULT');
const NEAREST_NODE_WITH_LOC = Symbol('NEAREST_NODE_WITH_LOC');
const CLONED_NEAREST_NODE_WITH_LOC = Symbol('CLONED_NEAREST_NODE_WITH_LOC');
function wrapNode(node, nearestNodeWithLoc, parseResult) {
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

      parseResult.modifications.push({
        start: original.loc.start,
        end: original.loc.end,
        value: updatedValue,
      });
    },
  });

  for (let key in node) {
    let value = node[key];
    if (typeof value === 'object' && value !== null) {
      let propertyProxy = wrapNode(
        value,
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
    this.source = template.match(reLines);
    this.modifications = [];

    let ast = preprocess(template);
    this.ast = wrapNode(ast, ast, this);
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
      let printed = _print(value);

      if (start.line === end.line) {
        let lineToUpdate = start.line - 1;
        let lineContents = this.source[lineToUpdate];
        let updateContents =
          lineContents.slice(0, start.column) + printed + lineContents.slice(end.column);

        this.source[lineToUpdate] = updateContents;
      } else {
        throw new Error('not implemented multi-line replacements');
      }
    });
  }

  // mostly copy/pasta from tildeio/htmlbars with a few tweaks:
  // https://github.com/tildeio/htmlbars/blob/v0.4.17/packages/htmlbars-syntax/lib/parser.js#L59-L90
  print(node) {
    this.applyModifications();

    if (!node.loc) {
      return;
    }

    let firstLine = node.loc.start.line - 1;
    let lastLine = node.loc.end.line - 1;
    let currentLine = firstLine - 1;
    let firstColumn = node.loc.start.column;
    let lastColumn = node.loc.end.column;
    let string = [];
    let line;

    while (currentLine < lastLine) {
      currentLine++;
      line = this.source[currentLine];

      if (currentLine === firstLine) {
        if (firstLine === lastLine) {
          string.push(line.slice(firstColumn, lastColumn));
        } else {
          string.push(line.slice(firstColumn));
        }
      } else if (currentLine === lastLine) {
        string.push(line.slice(0, lastColumn));
      } else {
        string.push(line);
      }
    }

    return string.join('');
  }
}

function parse(template) {
  return new ParseResult(template).ast;
}

function print(ast) {
  let parseResult = ast[PARSE_RESULT];
  return parseResult.print(ast);
}

module.exports = {
  parse,
  print,
};
