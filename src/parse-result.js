const { preprocess, print: _print } = require('@glimmer/syntax');

const reLines = /(.*?(?:\r\n?|\n|$))/gm;

const NODE_TYPES_WITH_BEGIN_END = ['BlockStatement', 'ElementNode'];

/**
  Quick helper method to make it easier to find the children for a given input
  node, `BlockStatement` is intentionally left out because of its support for
  `inverse` / `program`: its not clear which should be the "children".
*/
function childrenFor(node) {
  switch (node.type) {
    case 'Block':
    case 'Program':
    case 'Template':
      return node.body;

    case 'ElementNode':
      return node.children;
  }
}

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

    this.nodeInfo = new Map();
    this.ancestor = new Map();
    this.dirtyFields = new Map();

    this.ast = this.wrapNode(null, ast);
  }

  wrapNode(ancestor, node) {
    this.ancestor.set(node, ancestor);
    this.nodeInfo.set(node, {
      original: JSON.parse(JSON.stringify(node)),
      source: this.sourceForLoc(node.loc),
    });

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

      deleteProperty: (target, property) => {
        let result = Reflect.deleteProperty(target, property);

        if (hasLocInfo) {
          this.markAsDirty(node, property);
        } else {
          this.markAsDirty(ancestor.node, ancestor.key);
        }

        return result;
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

  /*
   Used to associate the original source with a given node (while wrapping AST nodes
   in a proxy).
  */
  sourceForLoc(loc) {
    if (!loc) {
      return;
    }

    let firstLine = loc.start.line - 1;
    let lastLine = loc.end.line - 1;
    let currentLine = firstLine - 1;
    let firstColumn = loc.start.column;
    let lastColumn = loc.end.column;
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
    let dirtyFields = this.dirtyFields.get(node);
    if (dirtyFields === undefined) {
      dirtyFields = new Set();
      this.dirtyFields.set(node, dirtyFields);
    }

    dirtyFields.add(property);

    let ancestor = this.ancestor.get(node);
    while (ancestor !== null) {
      this.markAsDirty(ancestor.node, ancestor.key);
      ancestor = this.ancestor.get(ancestor.node);
    }
  }

  print(ast = this._originalAst) {
    if (!ast) {
      return '';
    }
    debugger;

    let nodeInfo = this.nodeInfo.get(ast);
    // make a copy of the dirtyFields, so we can easily track
    // unhandled dirtied fields
    let dirtyFields = new Set(this.dirtyFields.get(ast));
    if (dirtyFields.size === 0 && nodeInfo !== undefined) {
      return nodeInfo.source;
    }

    // TODO: this isn't quite right, it forces the whole subtree
    // to be reprinted which isn't correct
    if (nodeInfo === undefined) {
      return _print(ast, { entityEncoding: 'raw' });
    }

    // TODO: splice the original source **excluding** "children"
    // based on dirtyFields
    const output = [];

    switch (ast.type) {
      case 'Template':
        {
          let body = ast.body.map(node => this.print(node)).join('');
          output.push(body);
        }
        break;
      case 'ElementNode':
        {
          let { original } = nodeInfo;
          let { selfClosing, children } = original;
          let hadChildren = children.length > 0;

          let openSource = this.sourceForLoc(
            hadChildren
              ? {
                  start: original.loc.start,
                  end: children[0].loc.start,
                }
              : ast.loc
          );

          let childrenSource = hadChildren
            ? this.sourceForLoc({
                start: original.children[0].loc.start,
                end: original.children[children.length - 1].loc.end,
              })
            : '';

          let closeSource = selfClosing
            ? ''
            : this.sourceForLoc({
                start: children[children.length - 1].loc.end,
                end: original.loc.end,
              });

          if (dirtyFields.has('children')) {
            childrenSource = ast.children.map(child => this.print(child)).join('');
            dirtyFields.delete('children');
          }

          if (dirtyFields.has('tag')) {
            dirtyFields.delete('tag');
            openSource = `<${ast.tag} ${openSource.slice(original.tag.length + 2)}`;
            closeSource = selfClosing ? '' : `</${ast.tag}>`;
          }

          output.push(openSource, childrenSource, closeSource);

          if (dirtyFields.size > 0) {
            throw new Error(`Unhandled mutations for ${ast.type}: ${Array.from(dirtyFields)}`);
          }
        }
        break;

      case 'MustacheStatement':
        {
          let { original } = nodeInfo;
          let hadParams = original.params.length > 0;
          let hadHash = original.hash.pairs.length > 0;

          let openSource = this.sourceForLoc({
            start: original.loc.start,
            end: original.path.loc.end,
          });

          let postPathWhitespace = hadParams
            ? this.sourceForLoc({
                start: original.path.loc.end,
                end: original.params[0].loc.start,
              })
            : '';

          let paramsSource = hadParams
            ? this.sourceForLoc({
                start: original.params[0].loc.start,
                end: original.params[original.params.length - 1].loc.end,
              })
            : '';

          let postParamsWhitespace =
            hadHash && hadParams
              ? this.sourceForLoc({
                  start: original.params[original.params.length - 1].loc.end,
                  end: original.hash.loc.start,
                })
              : '';

          let hashSource = hadHash ? this.sourceForLoc(original.hash.loc) : '';

          let endSource = this.sourceForLoc({
            start: hadHash
              ? original.hash.loc.end
              : hadParams
              ? original.params[original.params.length - 1].loc.end
              : original.path.loc.end,
            end: original.loc.end,
          });

          if (dirtyFields.has('path')) {
            openSource =
              this.sourceForLoc({
                start: original.loc.start,
                end: original.path.loc.start,
              }) + _print(ast.path);

            dirtyFields.delete('path');
          }

          if (dirtyFields.has('hash')) {
            if (ast.hash.pairs.length === 0) {
              hashSource = '';

              if (ast.params.length === 0) {
                postPathWhitespace = '';
              }
            } else {
              let joinWith;
              if (original.hash.pairs.length > 1) {
                joinWith = this.sourceForLoc({
                  start: original.hash.pairs[0].loc.end,
                  end: original.hash.pairs[1].loc.start,
                });
              } else if (hadParams) {
                joinWith = postPathWhitespace;
              } else {
                joinWith = ' ';
              }

              hashSource = ast.hash.pairs
                .map(pair => {
                  return this.print(pair);
                })
                .join(joinWith);

              if (hadParams && !hadHash) {
                postParamsWhitespace = joinWith;
              }
            }

            dirtyFields.delete('hash');
          }

          // TODO: handle params mutation

          output.push(
            openSource,
            postPathWhitespace,
            paramsSource,
            postParamsWhitespace,
            hashSource,
            endSource
          );

          if (dirtyFields.size > 0) {
            throw new Error(`Unhandled mutations for ${ast.type}: ${Array.from(dirtyFields)}`);
          }
        }
        break;
      case 'HashPair':
        output.push(`${ast.key}=${this.print(ast.value)}`);
        break;
      case 'Program':
      case 'Block':
      case 'AttrNode':
      case 'ConcatStatement':
      case 'TextNode':
      case 'MustacheCommentStatement':
      case 'ElementModifierStatement':
      case 'PathExpression':
      case 'SubExpression':
      case 'BlockStatement':
      case 'PartialStatement':
      case 'CommentStatement':
      case 'Hash':
      case 'StringLiteral':
      case 'NumberLiteral':
      case 'UndefinedLiteral':
      case 'NullLiteral':
      case 'BooleanLiteral':
        break;
    }

    return output.join('');
  }
};
