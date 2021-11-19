import benchmark from 'benchmark';
import { builders, parse, print } from '../lib/index.js';

const template = `
<Sidebar
  foo="bar"
     item={{hmmm}}
/>
`;

const suite = new benchmark.Suite();
suite
  .add('parse + modify + print', () => {
    let ast = parse(template);
    ast.body[1].attributes[1].value.path = builders.path('this.hmmm');
    print(ast);
  })
  .on('cycle', (event) => {
    console.log(String(event.target));
  })
  .run({ async: true });
