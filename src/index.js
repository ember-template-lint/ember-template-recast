const {
  preprocess,
  print: _print,
  traverse: _traverse,
  builders,
  Walker,
} = require('@glimmer/syntax');

const reLines = /(.*?(?:\r\n?|\n|$))/gm;

const PARSE_RESULT_FOR = new WeakMap();
const SOURCE_FOR = new WeakMap();
const ANCESTOR_FOR = new WeakMap();
const DIRTY_FIELDS_FOR = new WeakMap();

function sourceForNode(node, sourceLines) {
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
    line = sourceLines[currentLine];

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

function markAsDirty(node, property) {
  let dirtyFields = DIRTY_FIELDS_FOR.get(node);
  if (dirtyFields === undefined) {
    dirtyFields = new Set();
    DIRTY_FIELDS_FOR.set(node, dirtyFields);
  }

  dirtyFields.add(property);

  let ancestor = ANCESTOR_FOR.get(node);
  while (ancestor !== null) {
    markAsDirty(ancestor.node, ancestor.key);
    ancestor = ANCESTOR_FOR.get(ancestor.node);
  }
}

function wrapNode(ancestor, node, sourceLines) {
  ANCESTOR_FOR.set(node, ancestor);
  SOURCE_FOR.set(node, sourceForNode(node, sourceLines));

  let hasLocInfo = !!node.loc;
  let propertyProxyMap = new Map();

  let proxy = new Proxy(node, {
    get(target, property) {
      if (propertyProxyMap.has(property)) {
        return propertyProxyMap.get(property);
      }

      return Reflect.get(target, property);
    },

    set(target, property, value) {
      Reflect.set(target, property, value);

      if (hasLocInfo) {
        markAsDirty(node, property);
      } else {
        markAsDirty(ancestor.node, ancestor.key);
      }

      return true;
    },
  });

  for (let key in node) {
    let value = node[key];
    if (typeof value === 'object' && value !== null) {
      let propertyProxy = wrapNode({ node, key }, value, sourceLines);

      propertyProxyMap.set(key, propertyProxy);
    }
  }

  return proxy;
}

class ParseResult {
  constructor(template) {
    let ast = preprocess(template, {
      mode: 'codemod',
      parseOptions: {
        ignoreStandalone: true,
      },
    });

    this.source = template.match(reLines);
    this._originalAst = ast;
    this.ast = wrapNode(null, ast, this.source);
    PARSE_RESULT_FOR.set(this.ast, this);
  }

  print() {
    return build(this._originalAst);
  }
}

function build(ast) {
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

function parse(template) {
  return new ParseResult(template).ast;
}

function print(ast) {
  let parseResult = PARSE_RESULT_FOR.get(ast);
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
