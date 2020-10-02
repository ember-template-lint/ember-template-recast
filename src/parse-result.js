const { preprocess, print: _print, traverse } = require('@glimmer/syntax');
const { sortByLoc, sourceForLoc, getLines } = require('./utils');

const leadingWhitespace = /(^\s+)/;
const attrNodeParts = /(^[^=]+)(\s+)?(=)?(\s+)?(['"])?(\S+)?/;
const hashPairParts = /(^[^=]+)(\s+)?=(\s+)?(\S+)/;

const voidTagNames = new Set([
  'area',
  'base',
  'br',
  'col',
  'command',
  'embed',
  'hr',
  'img',
  'input',
  'keygen',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

/*
  This is needed to address issues in the glimmer-vm AST _before_ any of the nodes and node
  values are cached. The specific issues being worked around are:

  * https://github.com/glimmerjs/glimmer-vm/pull/953
  * https://github.com/glimmerjs/glimmer-vm/pull/954
*/
function fixASTIssues(sourceLines, ast) {
  traverse(ast, {
    AttrNode(node) {
      let source = sourceForLoc(sourceLines, node.loc);
      let [, , , equals, , quote] = source.match(attrNodeParts);
      let isValueless = !equals;

      // TODO: manually working around https://github.com/glimmerjs/glimmer-vm/pull/953
      if (isValueless && node.value.type === 'TextNode' && node.value.chars === '') {
        // \n is not valid within an attribute name (it would indicate two attributes)
        // always assume the attribute ends on the starting line
        node.loc.end.line = node.loc.start.line;
        node.loc.end.column = node.loc.start.column + node.name.length;
      }

      node.isValueless = isValueless;
      node.quoteType = quote ? quote : null;
    },
    TextNode(node, path) {
      let source = sourceForLoc(sourceLines, node.loc);
      switch (path.parentNode.type) {
        case 'AttrNode': {
          if (
            node.chars.length > 0 &&
            ((source.startsWith(`'`) && source.endsWith(`'`)) ||
              (source.startsWith(`"`) && source.endsWith(`"`)))
          ) {
            node.loc.end.column = node.loc.end.column - 1;
            node.loc.start.column = node.loc.start.column + 1;
          }
          break;
        }
        case 'ConcatStatement': {
          // TODO: manually working around https://github.com/glimmerjs/glimmer-vm/pull/954
          let isFirstPart = path.parentNode.parts.indexOf(node) === 0;

          if (isFirstPart && node.loc.start.column > path.parentNode.loc.start.column + 1) {
            node.loc.start.column = node.loc.start.column - 1;
          }
        }
      }
    },
  });

  return ast;
}

module.exports = class ParseResult {
  constructor(template, nodesInfo) {
    let ast = preprocess(template, {
      mode: 'codemod',
    });

    let source = getLines(template);

    ast = fixASTIssues(source, ast);
    this.source = source;
    this._originalAst = ast;

    this.nodeInfo = nodesInfo;
    this.ancestor = new Map();
    this.dirtyFields = new Map();

    this.ast = this.wrapNode(null, ast);
  }

  wrapNode(ancestor, node) {
    this.ancestor.set(node, ancestor);

    let nodeInfo = {
      node,
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
        if (propertyProxyMap.has(property)) {
          propertyProxyMap.set(property, value);
        }

        Reflect.set(target, property, value);

        if (hasLocInfo) {
          this.markAsDirty(node, property);
        } else {
          this.markAsDirty(ancestor.node, ancestor.key);
        }

        return true;
      },

      deleteProperty: (target, property) => {
        if (propertyProxyMap.has(property)) {
          propertyProxyMap.delete(property);
        }

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
    return sourceForLoc(this.source, loc);
  }

  markAsDirty(node, property) {
    let dirtyFields = this.dirtyFields.get(node);
    if (dirtyFields === undefined) {
      dirtyFields = new Set();
      this.dirtyFields.set(node, dirtyFields);
    }

    dirtyFields.add(property);

    let ancestor = this.ancestor.get(node);
    if (ancestor !== null) {
      this.markAsDirty(ancestor.node, ancestor.key);
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

    let postHashSource = this.sourceForLoc({
      start: hadHash
        ? original.hash.loc.end
        : hadParams
        ? original.params[original.params.length - 1].loc.end
        : original.path.loc.end,
      end: original.loc.end,
    });

    nodeInfo.postHashWhitespace = '';
    let postHashWhitespaceMatch = postHashSource.match(leadingWhitespace);
    if (postHashWhitespaceMatch) {
      nodeInfo.postHashWhitespace = postHashWhitespaceMatch[0];
    }
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
        } else if (nodeInfo.hadHash) {
          joinWith = nodeInfo.postParamsWhitespace;
        } else {
          joinWith = ' ';
        }

        if (joinWith.trim() !== '') {
          // if the autodetection above resulted in some non whitespace
          // values, reset to `' '`
          joinWith = ' ';
        }

        nodeInfo.hashSource = ast.hash.pairs
          .map((pair) => {
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

      if (joinWith.trim() !== '') {
        // if the autodetection above resulted in some non whitespace
        // values, reset to `' '`
        joinWith = ' ';
      }
      nodeInfo.paramsSource = ast.params.map((param) => this.print(param)).join(joinWith);

      if (nodeInfo.hadParams && ast.params.length === 0) {
        nodeInfo.postPathWhitespace = '';
      } else if (!nodeInfo.hadParams && ast.params.length > 0) {
        nodeInfo.postPathWhitespace = joinWith;
      }

      dirtyFields.delete('params');
    }
  }

  print(_ast = this._originalAst) {
    if (!_ast) {
      return '';
    }

    let nodeInfo = this.nodeInfo.get(_ast);

    if (nodeInfo === undefined) {
      return _print(_ast, {
        entityEncoding: 'raw',

        override: (ast) => {
          if (this.nodeInfo.has(ast)) {
            return this.print(ast);
          }
        },
      });
    }

    // this ensures that we are operating on the actual node and not a
    // proxy (we can get Proxies here when transforms splice body/children)
    let ast = nodeInfo.node;

    // make a copy of the dirtyFields, so we can easily track
    // unhandled dirtied fields
    let dirtyFields = new Set(this.dirtyFields.get(ast));
    if (dirtyFields.size === 0 && nodeInfo !== undefined) {
      return nodeInfo.source;
    }

    // TODO: splice the original source **excluding** "children"
    // based on dirtyFields
    const output = [];

    let { original } = nodeInfo;

    switch (ast.type) {
      case 'Program':
      case 'Block':
      case 'Template':
        {
          let bodySource = nodeInfo.source;

          if (dirtyFields.has('body')) {
            bodySource = ast.body.map((node) => this.print(node)).join('');

            dirtyFields.delete('body');
          }

          output.push(bodySource);
        }
        break;
      case 'ElementNode':
        {
          let { selfClosing, children } = original;
          let hadChildren = children.length > 0;
          let hadBlockParams = original.blockParams.length > 0;

          let openSource = `<${original.tag}`;

          let originalOpenParts = []
            .concat(original.attributes, original.modifiers, original.comments)
            .sort(sortByLoc);

          let postTagWhitespace;
          if (originalOpenParts.length > 0) {
            postTagWhitespace = this.sourceForLoc({
              start: {
                line: original.loc.start.line,
                column: original.loc.start.column + 1 /* < */ + original.tag.length,
              },
              end: originalOpenParts[0].loc.start,
            });
          } else if (selfClosing) {
            postTagWhitespace = nodeInfo.source.substring(
              openSource.length,
              nodeInfo.source.length - 2
            );
          } else {
            postTagWhitespace = '';
          }

          let openPartsSource = originalOpenParts.reduce((acc, part, index, parts) => {
            let partSource = this.sourceForLoc(part.loc);

            if (index === parts.length - 1) {
              return acc + partSource;
            }

            let joinPartWith = this.sourceForLoc({
              start: parts[index].loc.end,
              end: parts[index + 1].loc.start,
            });

            if (joinPartWith.trim() !== '') {
              // if the autodetection above resulted in some non whitespace
              // values, reset to `' '`
              joinPartWith = ' ';
            }

            return acc + partSource + joinPartWith;
          }, '');

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
          } else if (hadBlockParams) {
            let postPartsSource = this.sourceForLoc({
              start: {
                line: original.loc.start.line,
                column: original.loc.start.column + 1 + original.tag.length,
              },
              end: hadChildren ? original.children[0].loc.start : original.loc.end,
            });

            let matchedWhitespace = postPartsSource.match(leadingWhitespace);
            if (matchedWhitespace) {
              postPartsWhitespace = matchedWhitespace[0];
            }
          }

          let blockParamsSource = '';
          let postBlockParamsWhitespace = '';
          if (original.blockParams.length > 0) {
            let blockParamStartIndex = nodeInfo.source.indexOf('as |');
            let blockParamsEndIndex = nodeInfo.source.indexOf('|', blockParamStartIndex + 4);
            blockParamsSource = nodeInfo.source.substring(
              blockParamStartIndex,
              blockParamsEndIndex + 1
            );

            let closeOpenIndex = nodeInfo.source.indexOf(selfClosing ? '/>' : '>');
            postBlockParamsWhitespace = nodeInfo.source.substring(
              blockParamsEndIndex + 1,
              closeOpenIndex
            );
          }

          let closeOpen = selfClosing ? `/>` : `>`;

          let childrenSource = hadChildren
            ? this.sourceForLoc({
                start: original.children[0].loc.start,
                end: original.children[children.length - 1].loc.end,
              })
            : '';

          let closeSource = selfClosing
            ? ''
            : voidTagNames.has(original.tag)
            ? ''
            : `</${original.tag}>`;

          if (dirtyFields.has('tag')) {
            openSource = `<${ast.tag}`;

            closeSource = selfClosing ? '' : voidTagNames.has(ast.tag) ? '' : `</${ast.tag}>`;

            dirtyFields.delete('tag');
          }

          if (dirtyFields.has('children')) {
            childrenSource = ast.children.map((child) => this.print(child)).join('');

            if (selfClosing) {
              closeOpen = `>`;
              closeSource = `</${ast.tag}>`;
              ast.selfClosing = false;

              if (originalOpenParts.length === 0 && postTagWhitespace === ' ') {
                postTagWhitespace = '';
              }

              if (originalOpenParts.length > 0 && postPartsWhitespace === ' ') {
                postPartsWhitespace = '';
              }
            }

            dirtyFields.delete('children');
          }

          if (
            dirtyFields.has('attributes') ||
            dirtyFields.has('comments') ||
            dirtyFields.has('modifiers')
          ) {
            let openParts = [].concat(ast.attributes, ast.modifiers, ast.comments).sort(sortByLoc);

            openPartsSource = openParts.reduce((acc, part, index, parts) => {
              let partSource = this.print(part);

              if (index === parts.length - 1) {
                return acc + partSource;
              }

              let joinPartWith = this.sourceForLoc({
                start: parts[index].loc.end,
                end: parts[index + 1].loc.start,
              });

              if (joinPartWith === '' || joinPartWith.trim() !== '') {
                // if the autodetection above resulted in some non whitespace
                // values, reset to `' '`
                joinPartWith = ' ';
              }

              return acc + partSource + joinPartWith;
            }, '');

            if (originalOpenParts.length === 0) {
              postTagWhitespace = ' ';
            }

            if (openParts.length === 0 && originalOpenParts.length > 0) {
              postTagWhitespace = '';
            }

            if (openParts.length > 0 && ast.selfClosing) {
              postPartsWhitespace = postPartsWhitespace || ' ';
            }

            dirtyFields.delete('attributes');
            dirtyFields.delete('comments');
            dirtyFields.delete('modifiers');
          }

          if (dirtyFields.has('blockParams')) {
            if (ast.blockParams.length === 0) {
              blockParamsSource = '';
              postPartsWhitespace = '';
            } else {
              blockParamsSource = `as |${ast.blockParams.join(' ')}|`;

              // ensure we have at least a space
              postPartsWhitespace = postPartsWhitespace || ' ';
            }

            dirtyFields.delete('blockParams');
          }

          output.push(
            openSource,
            postTagWhitespace,
            openPartsSource,
            postPartsWhitespace,
            blockParamsSource,
            postBlockParamsWhitespace,
            closeOpen,
            childrenSource,
            closeSource
          );
        }
        break;
      case 'MustacheStatement':
      case 'ElementModifierStatement':
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
          }).trimLeft();

          if (dirtyFields.has('path')) {
            openSource =
              this.sourceForLoc({
                start: original.loc.start,
                end: original.path.loc.start,
              }) + this.print(ast.path);

            dirtyFields.delete('path');
          }

          if (dirtyFields.has('type')) {
            // we only support going from SubExpression -> MustacheStatement
            if (original.type !== 'SubExpression' || ast.type !== 'MustacheStatement') {
              throw new Error(
                `ember-template-recast only supports updating the 'type' for SubExpression to MustacheStatement (you attempted to change ${original.type} to ${ast.type})`
              );
            }

            openSource = `{{${ast.path.original}`;
            endSource = '}}';

            dirtyFields.delete('type');
          }

          this._rebuildParamsHash(ast, nodeInfo, dirtyFields);

          output.push(
            openSource,
            nodeInfo.postPathWhitespace,
            nodeInfo.paramsSource,
            nodeInfo.postParamsWhitespace,
            nodeInfo.hashSource,
            nodeInfo.postHashWhitespace,
            endSource
          );
        }
        break;
      case 'ConcatStatement':
        {
          let partsSource = this.sourceForLoc({
            start: {
              line: original.loc.start.line,
              column: original.loc.start.column + 1,
            },

            end: {
              line: original.loc.end.line,
              column: original.loc.end.column - 1,
            },
          });

          if (dirtyFields.has('parts')) {
            partsSource = ast.parts.map((part) => this.print(part)).join('');

            dirtyFields.delete('parts');
          }

          output.push(partsSource);
        }
        break;
      case 'BlockStatement':
        {
          this._updateNodeInfoForParamsHash(ast, nodeInfo);

          let hadProgram = original.program.body.length > 0;
          let hadInverse = !!original.inverse;
          let hadProgramBlockParams = original.program.blockParams.length > 0;

          let openSource = this.sourceForLoc({
            start: original.loc.start,
            end: original.path.loc.end,
          });

          let blockParamsSource = '';
          let postBlockParamsWhitespace = '';
          if (hadProgramBlockParams) {
            let blockParamsSourceScratch = this.sourceForLoc({
              start: nodeInfo.hadHash
                ? original.hash.loc.end
                : nodeInfo.hadParams
                ? original.params[original.params.length - 1].loc.end
                : original.path.loc.end,
              end: original.loc.end,
            });

            let indexOfAsPipe = blockParamsSourceScratch.indexOf('as |');
            let indexOfEndPipe = blockParamsSourceScratch.indexOf('|', indexOfAsPipe + 4);

            blockParamsSource = blockParamsSourceScratch.substring(
              indexOfAsPipe,
              indexOfEndPipe + 1
            );

            let postBlockParamsWhitespaceMatch = blockParamsSourceScratch
              .substring(indexOfEndPipe + 1)
              .match(leadingWhitespace);
            if (postBlockParamsWhitespaceMatch) {
              postBlockParamsWhitespace = postBlockParamsWhitespaceMatch[0];
            }
          }

          let openEndSource;
          {
            let openEndSourceScratch = this.sourceForLoc({
              start: nodeInfo.hadHash
                ? original.hash.loc.end
                : nodeInfo.hadParams
                ? original.params[original.params.length - 1].loc.end
                : original.path.loc.end,
              end: original.loc.end,
            });

            let startingOffset = 0;
            if (hadProgramBlockParams) {
              let indexOfAsPipe = openEndSourceScratch.indexOf('as |');
              let indexOfEndPipe = openEndSourceScratch.indexOf('|', indexOfAsPipe + 4);

              startingOffset = indexOfEndPipe + 1;
            }

            let indexOfFirstCurly = openEndSourceScratch.indexOf('}');
            let indexOfSecondCurly = openEndSourceScratch.indexOf('}', indexOfFirstCurly + 1);

            openEndSource = openEndSourceScratch
              .substring(startingOffset, indexOfSecondCurly + 1)
              .trimLeft();
          }

          let programSource = hadProgram ? this.sourceForLoc(original.program.loc) : '';

          let inversePreamble = '';
          if (hadInverse) {
            if (hadProgram) {
              inversePreamble = this.sourceForLoc({
                start: original.program.loc.end,
                end: original.inverse.loc.start,
              });
            } else {
              let openEndSourceScratch = this.sourceForLoc({
                start: nodeInfo.hadHash
                  ? original.hash.loc.end
                  : nodeInfo.hadParams
                  ? original.params[original.params.length - 1].loc.end
                  : original.path.loc.end,
                end: original.loc.end,
              });

              let indexOfFirstCurly = openEndSourceScratch.indexOf('}');
              let indexOfSecondCurly = openEndSourceScratch.indexOf('}', indexOfFirstCurly + 1);
              let indexOfThirdCurly = openEndSourceScratch.indexOf('}', indexOfSecondCurly + 1);
              let indexOfFourthCurly = openEndSourceScratch.indexOf('}', indexOfThirdCurly + 1);

              inversePreamble = openEndSourceScratch.substring(
                indexOfSecondCurly + 1,
                indexOfFourthCurly + 1
              );
            }
          }

          // GH #149
          // In the event we're dealing with a chain of if/else-if/else, the inverse
          // should encompass the entirety of the chain. Sadly, the loc param of
          // original.inverse in this case only captures the block of the first inverse
          // not the entire chain. We instead look at the loc param of the nested body
          // node, which does report the entire chain.
          // In this case, because it also includes the preamble, we must also trim
          // that from our final inverse source.
          let inverseSource;
          if (hadInverse && original.inverse.chained) {
            inverseSource = this.sourceForLoc(original.inverse.body[0].loc) || '';
            inverseSource = inverseSource.slice(inversePreamble.length);
          } else {
            inverseSource = hadInverse ? this.sourceForLoc(original.inverse.loc) : '';
          }

          let endSource = '';
          if (!ast.wasChained) {
            let firstOpenCurlyFromEndIndex = nodeInfo.source.lastIndexOf('{');
            let secondOpenCurlyFromEndIndex = nodeInfo.source.lastIndexOf(
              '{',
              firstOpenCurlyFromEndIndex - 1
            );

            endSource = nodeInfo.source.substring(secondOpenCurlyFromEndIndex);
          }

          this._rebuildParamsHash(ast, nodeInfo, dirtyFields);

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

          if (dirtyFields.has('program')) {
            let programDirtyFields = new Set(this.dirtyFields.get(ast.program));

            if (programDirtyFields.has('blockParams')) {
              if (ast.program.blockParams.length === 0) {
                nodeInfo.postHashWhitespace = '';
                blockParamsSource = '';
              } else {
                nodeInfo.postHashWhitespace = nodeInfo.postHashWhitespace || ' ';
                blockParamsSource = `as |${ast.program.blockParams.join(' ')}|`;
              }
              programDirtyFields.delete('blockParams');
            }

            if (programDirtyFields.has('body')) {
              programSource = ast.program.body.map((child) => this.print(child)).join('');

              programDirtyFields.delete('body');
            }

            if (programDirtyFields.size > 0) {
              throw new Error(
                `Unhandled mutations for ${ast.program.type}: ${Array.from(programDirtyFields)}`
              );
            }

            dirtyFields.delete('program');
          }

          if (dirtyFields.has('inverse')) {
            if (ast.inverse === null) {
              inverseSource = '';
              inversePreamble = '';
            } else {
              if (ast.inverse.chained) {
                inversePreamble = '';
                let inverseBody = ast.inverse.body[0];
                inverseBody.wasChained = true;
                inverseSource = this.print(inverseBody);
              } else {
                inverseSource = ast.inverse.body.map((child) => this.print(child)).join('');
              }

              if (!hadInverse) {
                // TODO: detect {{else}} vs {{else if foo}}
                inversePreamble = '{{else}}';
              }
            }

            dirtyFields.delete('inverse');
          }

          output.push(
            openSource,
            nodeInfo.postPathWhitespace,
            nodeInfo.paramsSource,
            nodeInfo.postParamsWhitespace,
            nodeInfo.hashSource,
            nodeInfo.postHashWhitespace,
            blockParamsSource,
            postBlockParamsWhitespace,
            openEndSource,
            programSource,
            inversePreamble,
            inverseSource,
            endSource
          );
        }
        break;
      case 'HashPair':
        {
          let { source } = nodeInfo;
          let [, keySource, postKeyWhitespace, postEqualsWhitespace] = source.match(hashPairParts);
          let valueSource = this.sourceForLoc(original.value.loc);

          if (dirtyFields.has('key')) {
            keySource = ast.key;

            dirtyFields.delete('key');
          }

          if (dirtyFields.has('value')) {
            valueSource = this.print(ast.value);

            dirtyFields.delete('value');
          }

          output.push(keySource, postKeyWhitespace, '=', postEqualsWhitespace, valueSource);
        }
        break;
      case 'AttrNode':
        {
          let { source } = nodeInfo;
          let [
            ,
            nameSource,
            postNameWhitespace,
            equals,
            postEqualsWhitespace,
            quote,
          ] = source.match(attrNodeParts);
          let valueSource = this.sourceForLoc(original.value.loc);

          // does not include ConcatStatement because `_print` automatically
          // adds a `"` around them, meaning we do not need to add our own quotes
          let wasQuotableValue = original.value.type === 'TextNode';

          if (dirtyFields.has('name')) {
            nameSource = ast.name;

            dirtyFields.delete('name');
          }

          if (dirtyFields.has('value')) {
            let newValueNeedsQuotes = ast.value.type === 'TextNode';

            if (!wasQuotableValue && newValueNeedsQuotes) {
              quote = '"';
            } else if (wasQuotableValue && !newValueNeedsQuotes) {
              quote = '';
            }

            valueSource = this.print(ast.value);

            dirtyFields.delete('value');
          }

          output.push(
            nameSource,
            postNameWhitespace,
            equals,
            postEqualsWhitespace,
            quote,
            valueSource,
            quote
          );
        }
        break;
      case 'PathExpression':
        {
          let { source } = nodeInfo;

          if (dirtyFields.has('original')) {
            source = ast.original;
            dirtyFields.delete('original');
          }

          output.push(source);
        }
        break;
      case 'MustacheCommentStatement':
      case 'CommentStatement':
        {
          let indexOfValue = nodeInfo.source.indexOf(original.value);
          let openSource = nodeInfo.source.substring(0, indexOfValue);
          let valueSource = original.value;
          let endSource = nodeInfo.source.substring(indexOfValue + valueSource.length);

          if (dirtyFields.has('value')) {
            valueSource = ast.value;

            dirtyFields.delete('value');
          }

          output.push(openSource, valueSource, endSource);
        }
        break;
      case 'TextNode':
        {
          let { source } = nodeInfo.source;

          if (dirtyFields.has('chars')) {
            source = ast.chars;
            dirtyFields.delete('chars');
          }

          output.push(source);
        }
        break;
      case 'StringLiteral':
        {
          let { source } = nodeInfo;

          let openQuote = source[0];
          let closeQuote = source[source.length - 1];
          let valueSource = source.slice(1, -1);

          if (dirtyFields.has('value')) {
            valueSource = ast.value;
            dirtyFields.delete('value');
          }

          output.push(openQuote, valueSource, closeQuote);
        }
        break;
      case 'BooleanLiteral':
      case 'NumberLiteral':
        {
          let { source } = nodeInfo.source;

          if (dirtyFields.has('value')) {
            source = ast.value;
            dirtyFields.delete('value');
          }

          output.push(source);
        }
        break;
      default:
        throw new Error(
          `ember-template-recast does not have the ability to update ${original.type}. Please open an issue so we can add support.`
        );
    }

    for (let field of dirtyFields.values()) {
      if (field in Object.keys(original)) {
        throw new Error(
          `ember-template-recast could not handle the mutations of \`${Array.from(
            dirtyFields
          )}\` on ${original.type}`
        );
      }
    }

    return output.join('');
  }
};
