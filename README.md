# ember-template-recast

## APIs

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
