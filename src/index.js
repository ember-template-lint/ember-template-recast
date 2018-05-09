const { preprocess } = require('@glimmer/syntax');

const reLines = /(.*?(?:\r\n?|\n|$))/gm;

const PARSE_RESULT_TO_AST_NODE = new WeakMap();
class ParseResult {
  constructor(template) {
    let parseResultContext = this;
    this.source = template.match(reLines);

    this.ast = preprocess(template, {
      plugins: {
        ast: [
          () => {
            return {
              name: 'associate-with-result',
              visitor: {
                All(node) {
                  PARSE_RESULT_TO_AST_NODE.set(node, parseResultContext);
                },
              },
            };
          },
        ],
      },
    });
  }

  // mostly copy/pasta from tildeio/htmlbars with a few tweaks:
  // https://github.com/tildeio/htmlbars/blob/v0.4.17/packages/htmlbars-syntax/lib/parser.js#L59-L90
  print(node) {
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
  let parseResult = PARSE_RESULT_TO_AST_NODE.get(ast);
  return parseResult.print(ast);
}

module.exports = {
  parse,
  print,
};
