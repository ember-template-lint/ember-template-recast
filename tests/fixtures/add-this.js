// module.exports = function() {
//   return {
//     PathExpression(node) {
//       let token = node.original;

//       if (token === 'property') {
//         root.original = `this.${token}`;
//       }
//     },
//   };
// };

module.exports = function({ source }, { parse, visit }) {
  const ast = parse(source);

  return visit(ast, env => {
    let { builders: b } = env.syntax;

    return {
      PathExpression(node) {
        let token = node.original;

        if (token === 'property') {
          return b.path(`this.${token}`);
        }

        return node;
      },
    };
  });
};
