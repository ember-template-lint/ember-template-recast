import { traverse, builders, Walker, print as glimmerPrint } from '@glimmer/syntax';
import type { AST, NodeVisitor } from '@glimmer/syntax';
import ParseResult, { NodeInfo } from './parse-result';

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
    return glimmerPrint(ast, {
      entityEncoding: 'raw',
      override: (ast) => {
        if (NODE_INFO.has(ast)) {
          return print(ast);
        }
      },
    });
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

export function envForTransformPlugin(
  templateOrOptions: string | AST.Template | TransformOptions,
  plugin?: TransformPluginBuilder
): TransformPluginEnv {
  let contents: string;
  let filePath: undefined | string;
  let template: string | AST.Template;

  if (plugin === undefined) {
    let options = templateOrOptions as TransformOptions;
    // TransformOptions invocation style
    template = options.template;
    filePath = options.filePath;
  } else {
    template = templateOrOptions as AST.Template;
    filePath = undefined;
  }

  let getAST = (): AST.Template => {
    if (typeof template === 'string') {
      return parse(template);
    } else {
      return template;
    }
  };

  const syntax = {
    parse,
    builders,
    print,
    traverse,
    Walker,
  };

  const env: TransformPluginEnv = {
    get contents() {
      if (typeof contents === 'undefined') {
        if (typeof template === 'string') {
          contents = template;
        } else {
          contents = print(getAST());
        }
      }

      return contents;
    },
    filePath,
    syntax,
    parseOptions: {
      srcName: filePath,
    },
  };

  return env;
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
  let template: string | AST.Template;

  const env = envForTransformPlugin(templateOrOptions, plugin);

  if (plugin === undefined) {
    let options = templateOrOptions as TransformOptions;
    plugin = options.plugin;
    template = options.template;
  } else {
    template = templateOrOptions as string;
  }

  const visitor = plugin(env);

  if (typeof template === 'string') {
    ast = parse(template as string);
  } else {
    // assume we were passed an ast
    ast = template as AST.Template;
  }

  traverse(ast, visitor);

  let code: string;

  return {
    ast,
    get code() {
      if (typeof code === 'undefined') {
        code = print(ast);
      }
      return code;
    },
  };
}

export { builders, traverse } from '@glimmer/syntax';
export { sourceForLoc } from './utils';
