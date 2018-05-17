# ember-template-recast

## APIs

### parse

Used to parse a given template string into an AST. Generally speaking, this AST
can be mutated and passed into `print` (docs below).

```js
const templateRecast = require('ember-template-recast');
const template = `
{{foo-bar
  baz="stuff"
}}
`;
let ast = templateRecast.parse(template);
// now you can work with `ast`
```

### print

Used to generate a new template string representing the provided AST.

```js
const templateRecast = require('ember-template-recast');
const template = `
{{foo-bar
  baz="stuff"
}}
`;
let ast = templateRecast.parse(template);
ast.body[0].hash[0].key = 'derp';

templateRecast.print(ast);

    {{foo-bar
      derp="stuff"
    }}
```

### traverse

Used to easily traverse (and possibly mutate) a given template. Returns the
resulting AST and the printed template.
```js
const templateRecast = require('ember-template-recast');
const template = `
{{foo-bar
  baz="stuff"
}}
`;
let { code } = transform(template, env => {
  let { builders: b } = env.syntax;

  return {
    MustacheStatement() {
      return b.mustache(b.path('wat-wat'));
    },
  };
});

console.log(code); // => {{wat-wat}}
```
