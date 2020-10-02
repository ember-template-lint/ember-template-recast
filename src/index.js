const { traverse, builders, Walker } = require('@glimmer/syntax');
const ParseResult = require('./parse-result');
const { sourceForLoc } = require('./utils');

const PARSE_RESULT_FOR = new WeakMap();
const NODES_INFO = new WeakMap();

function parse(template) {
  let result = new ParseResult(template, NODES_INFO);

  PARSE_RESULT_FOR.set(result.ast, result);

  return result.ast;
}

function print(ast) {
  let parseResult = PARSE_RESULT_FOR.get(ast);
  return parseResult.print();
}

function transform(template, plugin) {
  let ast, contents;
  if (typeof template === 'string') {
    contents = template;
    ast = parse(template);
  } else {
    // assume we were passed an ast
    ast = template;
  }
  let syntax = {
    parse,
    builders,
    print,
    traverse,
    Walker,
  };
  let env = { contents, syntax };
  let visitor = plugin(env);
  traverse(ast, visitor);
  return { ast, code: print(ast) };
}

module.exports = {
  builders,
  parse,
  print,
  transform,
  traverse,
  sourceForLoc,
};
