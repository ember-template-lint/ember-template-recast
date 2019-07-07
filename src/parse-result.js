const { preprocess, print: _print } = require('@glimmer/syntax');

const reLines = /(.*?(?:\r\n?|\n|$))/gm;
const leadingWhitespace = /(^\s+)/;

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

function isSynthetic(node) {
  if (node && node.loc) {
    return node.loc.source === '(synthetic)';
  }

  return false;
}

function sortByLoc(a, b) {
  if (isSynthetic(b)) {
    return -1;
  }

  if (a.loc.start.line < b.loc.start.line) {
    return -1;
  }

  if (a.loc.start.line === b.loc.start.line && a.loc.start.column < b.loc.start.column) {
    return -1;
  }

  return 1;
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
    let nodeInfo = {
      original: JSON.parse(JSON.stringify(node)),
      source: this.sourceForLoc(node.loc),
    };
    this.nodeInfo.set(node, nodeInfo);

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

    // this is needed in order to handle splicing of Template.body (which
    // happens when during replacement)
    this.nodeInfo.set(proxy, nodeInfo);

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

  _updateNodeInfoForParamsHash(ast, nodeInfo) {
    let { original } = nodeInfo;

    let hadParams = (nodeInfo.hadParams = original.params.length > 0);
    let hadHash = (nodeInfo.hadHash = original.hash.pairs.length > 0);

    nodeInfo.postPathWhitespace = hadParams
      ? this.sourceForLoc({
          start: original.path.loc.end,
          end: original.params[0].loc.start,
        })
      : '';

    nodeInfo.paramsSource = hadParams
      ? this.sourceForLoc({
          start: original.params[0].loc.start,
          end: original.params[original.params.length - 1].loc.end,
        })
      : '';

    nodeInfo.postParamsWhitespace = hadHash
      ? this.sourceForLoc({
          start: hadParams
            ? original.params[original.params.length - 1].loc.end
            : original.path.loc.end,
          end: original.hash.loc.start,
        })
      : '';

    nodeInfo.hashSource = hadHash ? this.sourceForLoc(original.hash.loc) : '';

    //let postHashSource = this.sourceForLoc({
    //  start: hadHash
    //    ? original.hash.loc.end
    //    : hadParams
    //    ? original.params[original.params.length - 1].loc.end
    //    : original.path.loc.end,
    //  end: original.loc.end,
    //});

    //nodeInfo.postHashWhitespace = '';
    //let postHashWhitespaceMatch = postHashSource.match(leadingWhitespace);
    //if (postHashWhitespaceMatch) {
    //  nodeInfo.postHashWhitespace = postHashWhitespaceMatch[0];
    //}
  }

  _rebuildParamsHash(ast, nodeInfo, dirtyFields) {
    let { original } = nodeInfo;
    if (dirtyFields.has('hash')) {
      if (ast.hash.pairs.length === 0) {
        nodeInfo.hashSource = '';

        if (ast.params.length === 0) {
          nodeInfo.postPathWhitespace = '';
          nodeInfo.postParamsWhitespace = '';
        }
      } else {
        let joinWith;
        if (original.hash.pairs.length > 1) {
          joinWith = this.sourceForLoc({
            start: original.hash.pairs[0].loc.end,
            end: original.hash.pairs[1].loc.start,
          });
        } else if (nodeInfo.hadParams) {
          joinWith = nodeInfo.postPathWhitespace;
        } else {
          joinWith = ' ';
        }

        nodeInfo.hashSource = ast.hash.pairs
          .map(pair => {
            return this.print(pair);
          })
          .join(joinWith);

        if (!nodeInfo.hadHash) {
          nodeInfo.postParamsWhitespace = joinWith;
        }
      }

      dirtyFields.delete('hash');
    }

    if (dirtyFields.has('params')) {
      let joinWith;
      if (original.params.length > 1) {
        joinWith = this.sourceForLoc({
          start: original.params[0].loc.end,
          end: original.params[1].loc.start,
        });
      } else if (nodeInfo.hadParams) {
        joinWith = nodeInfo.postPathWhitespace;
      } else if (nodeInfo.hadHash) {
        joinWith = nodeInfo.postParamsWhitespace;
      } else {
        joinWith = ' ';
      }
      nodeInfo.paramsSource = ast.params.map(param => this.print(param)).join(joinWith);

      if (nodeInfo.hadParams && ast.params.length === 0) {
        nodeInfo.postPathWhitespace = '';
      } else if (!nodeInfo.hadParams && ast.params.length > 0) {
        nodeInfo.postPathWhitespace = joinWith;
      }

      dirtyFields.delete('params');
    }
  }

  print(ast = this._originalAst) {
    if (!ast) {
      return '';
    }

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

    let { original } = nodeInfo;

    switch (ast.type) {
      case 'Template':
        {
          let body = ast.body.map(node => this.print(node)).join('');
          output.push(body);
        }
        break;
      case 'ElementNode':
        {
          let { selfClosing, children } = original;
          let hadChildren = children.length > 0;

          let openSource = `<${original.tag}`;

          let originalOpenParts = []
            .concat(original.attributes, original.modifiers, original.comments)
            .sort(sortByLoc);

          let postTagWhitespace =
            originalOpenParts.length > 0
              ? this.sourceForLoc({
                  start: {
                    line: original.loc.start.line,
                    column: original.loc.start.column + 1 /* < */ + original.tag.length,
                  },
                  end: originalOpenParts[0].loc.start,
                })
              : '';

          let joinOpenPartsWith = ' ';
          if (originalOpenParts.length > 1) {
            joinOpenPartsWith = this.sourceForLoc({
              start: originalOpenParts[0].loc.end,
              end: originalOpenParts[1].loc.start,
            });
          }
          let openPartsSource = originalOpenParts
            .map(part => this.sourceForLoc(part.loc))
            .join(joinOpenPartsWith);

          let postPartsWhitespace = '';
          if (originalOpenParts.length > 0) {
            let postPartsSource = this.sourceForLoc({
              start: originalOpenParts[originalOpenParts.length - 1].loc.end,
              end: hadChildren ? original.children[0].loc.start : original.loc.end,
            });

            let matchedWhitespace = postPartsSource.match(leadingWhitespace);
            if (matchedWhitespace) {
              postPartsWhitespace = matchedWhitespace[0];
            }
          }

          let closeOpen = selfClosing ? `/>` : `>`;

          let childrenSource = hadChildren
            ? this.sourceForLoc({
                start: original.children[0].loc.start,
                end: original.children[children.length - 1].loc.end,
              })
            : '';

          let closeSource = selfClosing ? '' : `</${original.tag}>`;

          if (dirtyFields.has('children')) {
            childrenSource = ast.children.map(child => this.print(child)).join('');
            dirtyFields.delete('children');
          }

          if (dirtyFields.has('tag')) {
            openSource = `<${ast.tag}`;
            closeSource = selfClosing ? '' : `</${ast.tag}>`;

            dirtyFields.delete('tag');
          }

          if (
            dirtyFields.has('attributes') ||
            dirtyFields.has('comments') ||
            dirtyFields.has('modifiers')
          ) {
            let openParts = [].concat(ast.attributes, ast.modifiers, ast.comments).sort(sortByLoc);

            openPartsSource = openParts.map(part => this.print(part)).join(joinOpenPartsWith);

            if (originalOpenParts.length === 0) {
              postTagWhitespace = ' ';
            }

            if (openParts.length === 0 && originalOpenParts.length > 0) {
              postTagWhitespace = '';
            }

            dirtyFields.delete('attributes');
            dirtyFields.delete('comments');
            dirtyFields.delete('modifiers');
          }

          output.push(
            openSource,
            postTagWhitespace,
            openPartsSource,
            postPartsWhitespace,
            closeOpen,
            childrenSource,
            closeSource
          );

          if (dirtyFields.size > 0) {
            throw new Error(`Unhandled mutations for ${ast.type}: ${Array.from(dirtyFields)}`);
          }
        }
        break;

      case 'MustacheStatement':
      case 'SubExpression':
        {
          this._updateNodeInfoForParamsHash(ast, nodeInfo);

          let openSource = this.sourceForLoc({
            start: original.loc.start,
            end: original.path.loc.end,
          });

          let endSource = this.sourceForLoc({
            start: nodeInfo.hadHash
              ? original.hash.loc.end
              : nodeInfo.hadParams
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

          this._rebuildParamsHash(ast, nodeInfo, dirtyFields);

          output.push(
            openSource,
            nodeInfo.postPathWhitespace,
            nodeInfo.paramsSource,
            nodeInfo.postParamsWhitespace,
            nodeInfo.hashSource,
            endSource
          );

          if (dirtyFields.size > 0) {
            throw new Error(`Unhandled mutations for ${ast.type}: ${Array.from(dirtyFields)}`);
          }
        }
        break;
      case 'BlockStatement':
        {
          this._updateNodeInfoForParamsHash(ast, nodeInfo);

          let hadInverse = !!ast.inverse;

          let openSource = this.sourceForLoc({
            start: original.loc.start,
            end: original.path.loc.end,
          });

          // TODO: account for block params here (openEndSource should _just_
          // be for `}}`, `}}}`, or `~}}`)
          let openEndSource = this.sourceForLoc({
            start: nodeInfo.hadHash
              ? original.hash.loc.end
              : nodeInfo.hadParams
              ? original.params[original.params.length - 1].loc.end
              : original.path.loc.end,
            end: original.program.loc.start,
          });

          let programSource = this.sourceForLoc(original.program.loc);

          let inverseSource = hadInverse ? this.sourceForLoc(original.inverse.loc) : '';

          let endSource = this.sourceForLoc({
            start: hadInverse ? original.inverse.loc.end : original.program.loc.end,
            end: original.loc.end,
          });

          if (dirtyFields.has('path')) {
            openSource =
              this.sourceForLoc({
                start: original.loc.start,
                end: original.path.loc.start,
              }) + _print(ast.path);

            let pathIndex = endSource.indexOf(original.path.original);
            endSource =
              endSource.slice(0, pathIndex) +
              ast.path.original +
              endSource.slice(pathIndex + original.path.original.length);

            dirtyFields.delete('path');
          }

          this._rebuildParamsHash(ast, nodeInfo, dirtyFields);

          output.push(
            openSource,
            nodeInfo.postPathWhitespace,
            nodeInfo.paramsSource,
            nodeInfo.postParamsWhitespace,
            nodeInfo.hashSource,
            openEndSource,
            programSource,
            inverseSource,
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
      case 'AttrNode':
        output.push(`${ast.name}=${this.print(ast.value)}`);
        break;
      case 'PathExpression':
        output.push(ast.original);
        break;
      case 'Program':
      case 'Block':
      case 'ConcatStatement':
      case 'TextNode':
      case 'MustacheCommentStatement':
      case 'ElementModifierStatement':
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
