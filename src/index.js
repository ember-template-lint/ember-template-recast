const { traverse, builders, Walker } = require('@glimmer/syntax');
const ParseResult = require('./parse-result');

const PARSE_RESULT_FOR = new WeakMap();

function parse(template) {
  let result = new ParseResult(template);

  PARSE_RESULT_FOR.set(result.ast.body, result);

  return result.ast;
}

function print(ast) {
  let parseResult = PARSE_RESULT_FOR.get(ast.body);
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
    traverse,
    Walker,
  };
  let env = { syntax };
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
};
