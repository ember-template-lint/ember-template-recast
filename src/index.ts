import { traverse, Walker, print as glimmerPrint } from '@glimmer/syntax';
import type { ASTv1 as AST, NodeVisitor } from '@glimmer/syntax';
import ParseResult, { NodeInfo } from './parse-result';
import { builders } from './custom-nodes';

const PARSE_RESULT_FOR = new WeakMap<AST.Node, ParseResult>();
const NODE_INFO = new WeakMap<AST.Node, NodeInfo>();

export function parse(template: string): AST.Template {
  const result = new ParseResult(template, NODE_INFO);

  PARSE_RESULT_FOR.set(result.ast, result);

  return result.ast;
}

export function print(ast: AST.Node): string {
  const parseResult = PARSE_RESULT_FOR.get(ast);

  // TODO: write a test for this case
  if (parseResult === undefined) {
    return glimmerPrint(ast, { entityEncoding: 'raw' });
  }

  return parseResult.print();
}

export interface Syntax {
  parse: typeof parse;
  builders: typeof builders;
  print: typeof print;
  traverse: typeof traverse;
  Walker: typeof Walker;
}

export interface TransformPluginEnv {
  syntax: Syntax;
  contents: string;
  filePath?: string;
  parseOptions: {
    srcName?: string;
  };
}

export interface TransformPluginBuilder {
  (env: TransformPluginEnv): NodeVisitor;
}

export interface ASTPlugin {
  name: string;
  visitor: NodeVisitor;
}

export interface TransformResult {
  ast: AST.Template;
  code: string;
}

export interface TransformOptions {
  /**
    The template to transform (either as a string or a pre-parsed AST.Template).
  */
  template: string | AST.Template;

  /**
    The plugin to use for transformation.
  */
  plugin: TransformPluginBuilder;

  /**
    The path (relative to the current working directory) to the file being transformed.

    This is useful when a given transform need to have differing behavior based on the
    location of the file (e.g. a component template should be modified differently than
    a route template).
  */
  filePath?: string;
}

export function transform(
  template: string | AST.Template,
  plugin: TransformPluginBuilder
): TransformResult;
export function transform(options: TransformOptions): TransformResult;
export function transform(
  templateOrOptions: string | AST.Template | TransformOptions,
  plugin?: TransformPluginBuilder
): TransformResult {
  let ast: AST.Template;
  let contents: string;
  let filePath: undefined | string;
  let template: string | AST.Template;

  if (plugin === undefined) {
    let options = templateOrOptions as TransformOptions;
    // TransformOptions invocation style
    template = options.template;
    plugin = options.plugin;
    filePath = options.filePath;
  } else {
    template = templateOrOptions as AST.Template;
    filePath = undefined;
  }

  if (typeof template === 'string') {
    ast = parse(template);
    contents = template;
  } else {
    // assume we were passed an ast
    ast = template;
    contents = print(ast);
  }

  const syntax = {
    parse,
    builders,
    print,
    traverse,
    Walker,
  };

  const env: TransformPluginEnv = {
    contents,
    filePath,
    syntax,
    parseOptions: {
      srcName: filePath,
    },
  };

  const visitor = plugin(env);
  traverse(ast, visitor);

  return { ast, code: print(ast) };
}

export type { AST, NodeVisitor } from '@glimmer/syntax';

export { traverse } from '@glimmer/syntax';
export { builders } from './custom-nodes';
export { sourceForLoc } from './utils';
