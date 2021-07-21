import { preprocess, builders, print as _print, traverse, ASTv1 as AST } from '@glimmer/syntax';
import { getLines, sortByLoc, sourceForLoc, isSyntheticWithNoLocation } from './utils';

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
function fixASTIssues(sourceLines: any, ast: any) {
  traverse(ast, {
    AttrNode(node: AST.AttrNode) {
      const source = sourceForLoc(sourceLines, node.loc);
      const attrNodePartsResults = source.match(attrNodeParts);
      if (attrNodePartsResults === null) {
        throw new Error(`Could not match attr node parts for ${source}`);
      }
      const [, , , equals, , quote] = attrNodePartsResults;
      const isValueless = !equals;

      // TODO: manually working around https://github.com/glimmerjs/glimmer-vm/pull/953
      if (isValueless && node.value.type === 'TextNode' && node.value.chars === '') {
        // \n is not valid within an attribute name (it would indicate two attributes)
        // always assume the attribute ends on the starting line
        const {
          start: { line, column },
        } = node.loc;
        node.loc = builders.loc(line, column, line, column + node.name.length);
      }

      (node as any).isValueless = isValueless;
      (node as any).quoteType = quote ? quote : null;
    },
    TextNode(node, path) {
      if (path.parentNode === null) {
        throw new Error(
          'ember-template-recast: Error while sanitizing input AST: found TextNode with no parentNode'
        );
      }

      switch (path.parentNode.type) {
        case 'AttrNode': {
          const source = sourceForLoc(sourceLines, node.loc);
          if (
            node.chars.length > 0 &&
            ((source.startsWith(`'`) && source.endsWith(`'`)) ||
              (source.startsWith(`"`) && source.endsWith(`"`)))
          ) {
            const { start, end } = node.loc;
            node.loc = builders.loc(start.line, start.column + 1, end.line, end.column - 1);
          }
          break;
        }
        case 'ConcatStatement': {
          const parent = path.parentNode as AST.ConcatStatement;
          const isFirstPart = parent.parts.indexOf(node) === 0;

          const { start, end } = node.loc;
          if (isFirstPart && node.loc.start.column > path.parentNode.loc.start.column + 1) {
            // TODO: manually working around https://github.com/glimmerjs/glimmer-vm/pull/954
            node.loc = builders.loc(start.line, start.column - 1, end.line, end.column);
          } else if (isFirstPart && node.chars.charAt(0) === '\n') {
            node.loc = builders.loc(start.line, start.column + 1, end.line, end.column);
          }
        }
      }
    },
  });

  return ast;
}

export interface NodeInfo {
  node: AST.Node;
  original: AST.Node;
  source: string;

  hadHash?: boolean;
  hadParams?: boolean;
  paramsSource?: string;
  hashSource?: string;
  postPathWhitespace?: string;
  postHashWhitespace?: string;
  postParamsWhitespace?: string;
}

export default class ParseResult {
  private source: string[];
  private _originalAst: AST.Template;
  private nodeInfo: WeakMap<AST.Node, NodeInfo>;
  private ancestor = new Map<any, any>();
  private dirtyFields = new Map<AST.Node, Set<string>>();
  public ast: AST.Template;

  constructor(template: string, nodeInfo: WeakMap<AST.Node, NodeInfo> = new WeakMap()) {
    let ast = preprocess(template, {
      mode: 'codemod',
    });

    const source = getLines(template);

    ast = fixASTIssues(source, ast);
    this.source = source;
    this._originalAst = ast;

    this.nodeInfo = nodeInfo;

    this.ast = this.wrapNode(null, ast);
  }

  private wrapNode(ancestor: any, node: any) {
    this.ancestor.set(node, ancestor);

    const nodeInfo = {
      node,
      original: JSON.parse(JSON.stringify(node)),
      source: this.sourceForLoc(node.loc),
    };

    this.nodeInfo.set(node, nodeInfo);

    const hasLocInfo = !!node.loc;
    const propertyProxyMap = new Map();

    const proxy = new Proxy(node, {
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

        const result = Reflect.deleteProperty(target, property);

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

    for (const key in node) {
      const value = node[key];

      if (key !== 'loc' && typeof value === 'object' && value !== null) {
        const propertyProxy = this.wrapNode({ node, key }, value);

        propertyProxyMap.set(key, propertyProxy);
      }
    }

    return proxy;
  }

  /*
   Used to associate the original source with a given node (while wrapping AST nodes
   in a proxy).
  */
  private sourceForLoc(loc: any) {
    return sourceForLoc(this.source, loc);
  }

  private markAsDirty(node: any, property: any) {
    let dirtyFields = this.dirtyFields.get(node);
    if (dirtyFields === undefined) {
      dirtyFields = new Set();
      this.dirtyFields.set(node, dirtyFields);
    }

    dirtyFields.add(property);

    const ancestor = this.ancestor.get(node);
    if (ancestor !== null) {
      this.markAsDirty(ancestor.node, ancestor.key);
    }
  }

  private _updateNodeInfoForParamsHash(_ast: any, nodeInfo: any) {
    const { original } = nodeInfo;

    const hadParams = (nodeInfo.hadParams = original.params.length > 0);
    const hadHash = (nodeInfo.hadHash = original.hash.pairs.length > 0);

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

    const postHashSource = this.sourceForLoc({
      start: hadHash
        ? original.hash.loc.end
        : hadParams
        ? original.params[original.params.length - 1].loc.end
        : original.path.loc.end,
      end: original.loc.end,
    });

    nodeInfo.postHashWhitespace = '';
    const postHashWhitespaceMatch = postHashSource.match(leadingWhitespace);
    if (postHashWhitespaceMatch) {
      nodeInfo.postHashWhitespace = postHashWhitespaceMatch[0];
    }
  }

  private _rebuildParamsHash(
    ast:
      | AST.MustacheStatement
      | AST.SubExpression
      | AST.ElementModifierStatement
      | AST.BlockStatement,
    nodeInfo: any,
    dirtyFields: any
  ) {
    const { original } = nodeInfo;
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
          .map((pair: AST.HashPair) => {
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

  print(_ast: AST.Node = this._originalAst): string {
    if (!_ast) {
      return '';
    }

    const nodeInfo = this.nodeInfo.get(_ast);

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
    const ast = nodeInfo.node;

    // make a copy of the dirtyFields, so we can easily track
    // unhandled dirtied fields
    const dirtyFields = new Set(this.dirtyFields.get(ast));
    if (dirtyFields.size === 0 && nodeInfo !== undefined) {
      return nodeInfo.source;
    }

    // TODO: splice the original source **excluding** "children"
    // based on dirtyFields
    const output = [];

    const { original } = nodeInfo;

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
          const element = original as AST.ElementNode;
          const { selfClosing, children } = element;
          const hadChildren = children.length > 0;
          const hadBlockParams = element.blockParams.length > 0;

          let openSource = `<${element.tag}`;

          const originalOpenParts = [
            ...element.attributes,
            ...element.modifiers,
            ...element.comments,
          ].sort(sortByLoc);

          let postTagWhitespace;
          if (originalOpenParts.length > 0) {
            postTagWhitespace = this.sourceForLoc({
              start: {
                line: element.loc.start.line,
                column: element.loc.start.column + 1 /* < */ + element.tag.length,
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
            const postPartsSource = this.sourceForLoc({
              start: originalOpenParts[originalOpenParts.length - 1].loc.end,
              end: hadChildren ? element.children[0].loc.start : element.loc.end,
            });

            const matchedWhitespace = postPartsSource.match(leadingWhitespace);
            if (matchedWhitespace) {
              postPartsWhitespace = matchedWhitespace[0];
            }
          } else if (hadBlockParams) {
            const postPartsSource = this.sourceForLoc({
              start: {
                line: element.loc.start.line,
                column: element.loc.start.column + 1 + element.tag.length,
              },
              end: hadChildren ? element.children[0].loc.start : element.loc.end,
            });

            const matchedWhitespace = postPartsSource.match(leadingWhitespace);
            if (matchedWhitespace) {
              postPartsWhitespace = matchedWhitespace[0];
            }
          }

          let blockParamsSource = '';
          let postBlockParamsWhitespace = '';
          if (element.blockParams.length > 0) {
            const blockParamStartIndex = nodeInfo.source.indexOf('as |');
            const blockParamsEndIndex = nodeInfo.source.indexOf('|', blockParamStartIndex + 4);
            blockParamsSource = nodeInfo.source.substring(
              blockParamStartIndex,
              blockParamsEndIndex + 1
            );

            const closeOpenIndex = nodeInfo.source.indexOf(selfClosing ? '/>' : '>');
            postBlockParamsWhitespace = nodeInfo.source.substring(
              blockParamsEndIndex + 1,
              closeOpenIndex
            );
          }

          let closeOpen = selfClosing ? `/>` : `>`;

          let childrenSource = hadChildren
            ? this.sourceForLoc({
                start: element.children[0].loc.start,
                end: element.children[children.length - 1].loc.end,
              })
            : '';

          let closeSource = selfClosing
            ? ''
            : voidTagNames.has(element.tag)
            ? ''
            : `</${element.tag}>`;

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
            const openParts = [...ast.attributes, ...ast.modifiers, ...ast.comments].sort(
              sortByLoc
            );

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
            end: (original as any).path.loc.end,
          });

          let endSource = this.sourceForLoc({
            start: nodeInfo.hadHash
              ? (original as any).hash.loc.end
              : nodeInfo.hadParams
              ? (original as any).params[(original as any).params.length - 1].loc.end
              : (original as any).path.loc.end,
            end: original.loc.end,
          }).trimLeft();

          if (dirtyFields.has('path')) {
            openSource =
              this.sourceForLoc({
                start: original.loc.start,
                end: (original as any).path.loc.start,
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

            // TODO: this is a logic error, assumes ast.path is a PathExpression but it could be a number of other things
            openSource = `{{${(ast.path as AST.PathExpression).original}`;
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
          const block = original as AST.BlockStatement;

          this._updateNodeInfoForParamsHash(ast, nodeInfo);

          const hadProgram = block.program.body.length > 0;
          const hadProgramBlockParams = block.program.blockParams.length > 0;

          let openSource = this.sourceForLoc({
            start: block.loc.start,
            end: block.path.loc.end,
          });

          let blockParamsSource = '';
          let postBlockParamsWhitespace = '';
          if (hadProgramBlockParams) {
            const blockParamsSourceScratch = this.sourceForLoc({
              start: nodeInfo.hadHash
                ? block.hash.loc.end
                : nodeInfo.hadParams
                ? block.params[block.params.length - 1].loc.end
                : block.path.loc.end,
              end: original.loc.end,
            });

            const indexOfAsPipe = blockParamsSourceScratch.indexOf('as |');
            const indexOfEndPipe = blockParamsSourceScratch.indexOf('|', indexOfAsPipe + 4);

            blockParamsSource = blockParamsSourceScratch.substring(
              indexOfAsPipe,
              indexOfEndPipe + 1
            );

            const postBlockParamsWhitespaceMatch = blockParamsSourceScratch
              .substring(indexOfEndPipe + 1)
              .match(leadingWhitespace);
            if (postBlockParamsWhitespaceMatch) {
              postBlockParamsWhitespace = postBlockParamsWhitespaceMatch[0];
            }
          }

          let openEndSource;
          {
            const openEndSourceScratch = this.sourceForLoc({
              start: nodeInfo.hadHash
                ? block.hash.loc.end
                : nodeInfo.hadParams
                ? block.params[block.params.length - 1].loc.end
                : block.path.loc.end,
              end: block.loc.end,
            });

            let startingOffset = 0;
            if (hadProgramBlockParams) {
              const indexOfAsPipe = openEndSourceScratch.indexOf('as |');
              const indexOfEndPipe = openEndSourceScratch.indexOf('|', indexOfAsPipe + 4);

              startingOffset = indexOfEndPipe + 1;
            }

            const indexOfFirstCurly = openEndSourceScratch.indexOf('}');
            const indexOfSecondCurly = openEndSourceScratch.indexOf('}', indexOfFirstCurly + 1);

            openEndSource = openEndSourceScratch
              .substring(startingOffset, indexOfSecondCurly + 1)
              .trimLeft();
          }

          let programSource = hadProgram ? this.sourceForLoc(block.program.loc) : '';

          let inversePreamble = '';
          if (block.inverse) {
            if (hadProgram) {
              inversePreamble = this.sourceForLoc({
                start: block.program.loc.end,
                end: block.inverse.loc.start,
              });
            } else {
              const openEndSourceScratch = this.sourceForLoc({
                start: nodeInfo.hadHash
                  ? block.hash.loc.end
                  : nodeInfo.hadParams
                  ? block.params[block.params.length - 1].loc.end
                  : block.path.loc.end,
                end: block.loc.end,
              });

              const indexOfFirstCurly = openEndSourceScratch.indexOf('}');
              const indexOfSecondCurly = openEndSourceScratch.indexOf('}', indexOfFirstCurly + 1);
              const indexOfThirdCurly = openEndSourceScratch.indexOf('}', indexOfSecondCurly + 1);
              const indexOfFourthCurly = openEndSourceScratch.indexOf('}', indexOfThirdCurly + 1);

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
          if (block.inverse && block.inverse.chained) {
            inverseSource = this.sourceForLoc(block.inverse.body[0].loc) || '';
            inverseSource = inverseSource.slice(inversePreamble.length);
          } else {
            inverseSource = block.inverse ? this.sourceForLoc(block.inverse.loc) : '';
          }

          let endSource = '';
          if (!(ast as any).wasChained) {
            const firstOpenCurlyFromEndIndex = nodeInfo.source.lastIndexOf('{');
            const secondOpenCurlyFromEndIndex = nodeInfo.source.lastIndexOf(
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
                end: block.path.loc.start,
              }) + _print(ast.path);

            // TODO: this is a logic error
            const pathIndex = endSource.indexOf((block.path as AST.PathExpression).original);
            endSource =
              endSource.slice(0, pathIndex) +
              (ast.path as AST.PathExpression).original +
              endSource.slice(pathIndex + (block.path as AST.PathExpression).original.length);

            dirtyFields.delete('path');
          }

          if (dirtyFields.has('program')) {
            const programDirtyFields = new Set(this.dirtyFields.get(ast.program));

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
            if (!ast.inverse) {
              inverseSource = '';
              inversePreamble = '';
            } else {
              if (ast.inverse.chained) {
                inversePreamble = '';
                const inverseBody = ast.inverse.body[0];
                (inverseBody as any).wasChained = true;
                inverseSource = this.print(inverseBody);
              } else {
                inverseSource = ast.inverse.body.map((child) => this.print(child)).join('');
              }

              if (!block.inverse) {
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
          const hashPair = original as AST.HashPair;
          const { source } = nodeInfo;
          const hashPairPartsResult = source.match(hashPairParts);
          if (hashPairPartsResult === null) {
            throw new Error('Could not match hash pair parts');
          }
          let [, keySource, postKeyWhitespace, postEqualsWhitespace] = hashPairPartsResult;
          let valueSource = this.sourceForLoc(hashPair.value.loc);

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
          const attrNode = original as AST.AttrNode;
          const { source } = nodeInfo;
          const attrNodePartsResults = source.match(attrNodeParts);
          if (attrNodePartsResults === null) {
            throw new Error(`Could not match attr node parts for ${source}`);
          }

          let [, nameSource, postNameWhitespace, equals, postEqualsWhitespace, quote] =
            attrNodePartsResults;
          let valueSource = this.sourceForLoc(attrNode.value.loc);

          // does not include ConcatStatement because `_print` automatically
          // adds a `"` around them, meaning we do not need to add our own quotes
          const wasQuotableValue = attrNode.value.type === 'TextNode';

          if (dirtyFields.has('name')) {
            if (!wasQuotableValue) {
              quote = '';
            }

            nameSource = ast.name;

            dirtyFields.delete('name');
          }

          if (dirtyFields.has('value')) {
            const newValueNeedsQuotes = ast.value.type === 'TextNode';

            if (!wasQuotableValue && newValueNeedsQuotes) {
              quote = '"';
            } else if (wasQuotableValue && !newValueNeedsQuotes) {
              quote = '';
            } else if (
              ast.value.type === 'ConcatStatement' &&
              isSyntheticWithNoLocation(ast.value)
            ) {
              // double quotes are automatically added around synthetic ConcatStatements
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
          const commentStatement = original as AST.CommentStatement;
          const indexOfValue = nodeInfo.source.indexOf(commentStatement.value);
          const openSource = nodeInfo.source.substring(0, indexOfValue);
          let valueSource = commentStatement.value;
          const endSource = nodeInfo.source.substring(indexOfValue + valueSource.length);

          if (dirtyFields.has('value')) {
            valueSource = ast.value;

            dirtyFields.delete('value');
          }

          output.push(openSource, valueSource, endSource);
        }
        break;
      case 'TextNode':
        {
          let { source } = nodeInfo;

          if (dirtyFields.has('chars')) {
            source = ast.chars;
            dirtyFields.delete('chars');
          }

          output.push(source);
        }
        break;
      case 'StringLiteral':
        {
          const { source } = nodeInfo;

          const openQuote = source[0];
          const closeQuote = source[source.length - 1];
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
          let { source } = nodeInfo;

          if (dirtyFields.has('value')) {
            source = ast.value.toString();
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

    for (const field of dirtyFields.values()) {
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
}
