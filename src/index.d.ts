import { Walker, AST, NodeVisitor, builders, traverse } from '@glimmer/syntax';

interface PluginEnv {
  builders: typeof builders;
  parse: typeof parse;
  print: typeof print;
  traverse: typeof traverse;
  Walker: Walker;
}

export { traverse, builders } from '@glimmer/syntax';
export declare function parse(template: string): AST.Template;
export declare function print(ast: AST.Node): string;
export declare function transform(template: string | AST.Node, plugin: (env: PluginEnv) => NodeVisitor): { ast: AST.Node, code: string };
