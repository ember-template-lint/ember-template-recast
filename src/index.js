const { preprocess, print: _print } = require('@glimmer/syntax');

const reLines = /(.*?(?:\r\n?|\n|$))/gm;

const PARSE_RESULT = Symbol('PARSE_RESULT');
function wrapNode(node, parseResult) {
  let propertyProxyMap = new Map();
  let original = JSON.parse(JSON.stringify(node));

  let proxy = new Proxy(node, {
    get(target, property) {
      if (property === PARSE_RESULT) {
        return parseResult;
      }

      if (propertyProxyMap.has(property)) {
        return propertyProxyMap.get(property);
      }

      let value = Reflect.get(node, property);
      if (typeof value === 'object') {
        let propertyProxy = wrapNode(value, parseResult);
        propertyProxyMap.set(property, propertyProxy);
        return propertyProxy;
      }

      return value;
    },

    set(target, property, value) {
      Reflect.set(target, property, value);

      parseResult.modifications.push({
        original,
        updated: JSON.parse(JSON.stringify(target)),
      });
    },
  });

  return proxy;
}

class ParseResult {
  constructor(template) {
    this.source = template.match(reLines);
    this.modifications = [];

    let ast = preprocess(template);
    this.ast = wrapNode(ast, this);
  }

  applyModifications() {
    let { modifications } = this;
    this.modifications = Object.freeze([]);

    let sortedModifications = modifications
      .sort(function(a, b) {
        return (
          a.original.loc.line - b.original.loc.line || a.original.loc.column - b.original.loc.column
        );
      })
      .reverse();

    sortedModifications.forEach(mod => {
      let loc = mod.original.loc;
      let printed = _print(mod.updated);

      if (loc.start.line === loc.end.line) {
        let lineToUpdate = loc.start.line - 1;
        let lineContents = this.source[lineToUpdate];
        let updateContents =
          lineContents.slice(0, loc.start.column) + printed + lineContents.slice(loc.end.column);

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
