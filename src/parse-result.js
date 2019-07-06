const { preprocess, print: _print } = require('@glimmer/syntax');

const reLines = /(.*?(?:\r\n?|\n|$))/gm;

const SOURCE_FOR = new WeakMap();
const ANCESTOR_FOR = new WeakMap();
const DIRTY_FIELDS_FOR = new WeakMap();

module.exports = class ParseResult {
  constructor(template) {
    let ast = preprocess(template, {
      mode: 'codemod',
      parseOptions: {
        ignoreStandalone: true,
      },
    });

    this.source = template.match(reLines);
    this._originalAst = ast;
    this.ast = this.wrapNode(null, ast);
  }

  wrapNode(ancestor, node) {
    ANCESTOR_FOR.set(node, ancestor);
    SOURCE_FOR.set(node, this.sourceForNode(node));

    let hasLocInfo = !!node.loc;
    let propertyProxyMap = new Map();

    let proxy = new Proxy(node, {
      get: (target, property) => {
        if (propertyProxyMap.has(property)) {
          return propertyProxyMap.get(property);
        }

        return Reflect.get(target, property);
      },

      set: (target, property, value) => {
        Reflect.set(target, property, value);

        if (hasLocInfo) {
          this.markAsDirty(node, property);
        } else {
          this.markAsDirty(ancestor.node, ancestor.key);
        }

        return true;
      },
    });

    for (let key in node) {
      let value = node[key];
      if (typeof value === 'object' && value !== null) {
        let propertyProxy = this.wrapNode({ node, key }, value);

        propertyProxyMap.set(key, propertyProxy);
      }
    }

    return proxy;
  }

  sourceForNode(node) {
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

  markAsDirty(node, property) {
    let dirtyFields = DIRTY_FIELDS_FOR.get(node);
    if (dirtyFields === undefined) {
      dirtyFields = new Set();
      DIRTY_FIELDS_FOR.set(node, dirtyFields);
    }

    dirtyFields.add(property);

    let ancestor = ANCESTOR_FOR.get(node);
    while (ancestor !== null) {
      this.markAsDirty(ancestor.node, ancestor.key);
      ancestor = ANCESTOR_FOR.get(ancestor.node);
    }
  }

  print(ast) {
    if (!ast) {
      return '';
    }

    let source = SOURCE_FOR.get(ast);
    let dirtyFields = DIRTY_FIELDS_FOR.get(ast) || new Set();
    if (dirtyFields.size === 0 && source !== undefined) {
      return source;
    }

    if (source === undefined) {
      return _print(ast, { entityEncoding: 'raw' });
    }

    // TODO: splice the original source **excluding** "children"
    // based on dirtyFields
    const output = [];

    switch (ast.type) {
      case 'Program':
      case 'Block':
      case 'Template':
      case 'ElementNode':
      case 'AttrNode':
      case 'ConcatStatement':
      case 'TextNode':
      case 'MustacheStatement':
      case 'MustacheCommentStatement':
      case 'ElementModifierStatement':
      case 'PathExpression':
      case 'SubExpression':
      case 'BlockStatement':
      case 'PartialStatement':
      case 'CommentStatement':
      case 'Hash':
      case 'HashPair':
        break;
      case 'StringLiteral':
      case 'NumberLiteral':
      case 'UndefinedLiteral':
      case 'NullLiteral':
      case 'BooleanLiteral':
    }

    return output.join('');
  }
};
