const { parse, print, transform } = require('..');
const { builders } = require('@glimmer/syntax');
const { stripIndent } = require('common-tags');

QUnit.module('ember-template-recast', function() {
  QUnit.test('basic parse + print (no modification)', function(assert) {
    let template = stripIndent`
      {{foo-bar
        baz="stuff"
      }}`;
    let ast = parse(template);

    assert.equal(print(ast), template);
  });

  QUnit.test('basic parse + print (no modification): void elements', function(assert) {
    let template = `<br><p>Hi!</p>`;
    let ast = parse(template);

    assert.equal(print(ast), template);
  });

  QUnit.test('basic parse + print (no modification) preserves blank lines', function(assert) {
    let template = stripIndent`
      {{foo-bar
        baz="stuff"
      }}


`;
    let ast = parse(template);

    assert.equal(print(ast), template);
  });

  QUnit.test('basic parse -> mutation -> print', function(assert) {
    let template = stripIndent`
      {{foo-bar
        baz="stuff"
        other='single quote'
      }}`;
    let ast = parse(template);
    ast.body[0].hash.pairs[0].key = 'derp';

    assert.equal(
      print(ast),
      stripIndent`
        {{foo-bar
          derp="stuff"
          other='single quote'
        }}`
    );
  });

  QUnit.test('basic parse -> mutation -> print: preserves HTML entities', function(assert) {
    let template = stripIndent`<div>&nbsp;</div>`;
    let ast = parse(template);
    ast.body[0].children.push(builders.text('derp&nbsp;'));

    assert.equal(print(ast), stripIndent`<div>&nbsp;derp&nbsp;</div>`);
  });

  QUnit.test('rename non-block component', function(assert) {
    let template = stripIndent`
      {{foo-bar
        baz="stuff"
        other='single quote'
      }}`;

    let ast = parse(template);
    ast.body[0].path = builders.path('baz-derp');

    assert.equal(
      print(ast),
      stripIndent`
        {{baz-derp
          baz="stuff"
          other='single quote'
        }}`
    );
  });

  QUnit.test('rename block component', function(assert) {
    let template = stripIndent`
      {{#foo-bar
        baz="stuff"
      }}
        <div data-foo='single quoted'>
          </div>
      {{/foo-bar}}`;

    let ast = parse(template);
    ast.body[0].path = builders.path('baz-derp');

    assert.equal(
      print(ast),
      stripIndent`
        {{#baz-derp
          baz="stuff"
        }}
          <div data-foo='single quoted'>
            </div>
        {{/baz-derp}}`
    );
  });

  QUnit.test('rename block component from longer to shorter name', function(assert) {
    let template = stripIndent`
      {{#this-is-a-long-name
        hello="world"
      }}
        <div data-foo='single quoted'>
          </div>
      {{/this-is-a-long-name}}{{someInlineComponent hello="world"}}`;

    let ast = parse(template);
    ast.body[0].path = builders.path('baz-derp');

    assert.equal(
      print(ast),
      stripIndent`
        {{#baz-derp
          hello="world"
        }}
          <div data-foo='single quoted'>
            </div>
        {{/baz-derp}}{{someInlineComponent hello="world"}}`
    );
  });

  QUnit.test('rename element tagname', function(assert) {
    let template = stripIndent`
      <div data-foo='single quoted'>
        </div>`;

    let ast = parse(template);
    ast.body[0].tag = 'a';

    assert.equal(
      print(ast),
      stripIndent`
        <a data-foo='single quoted'>
          </a>`
    );
  });

  QUnit.test('rename self-closing element tagname', function(assert) {
    let ast = parse('<Foo bar="baz"/>');

    ast.body[0].tag = 'Qux';

    assert.equal(print(ast), '<Qux bar="baz"/>');
  });

  QUnit.test('rename inline helper', function(assert) {
    let template = stripIndent`
      {{foo-bar
        baz=(stuff
          goes='here')
      }}`;

    let ast = parse(template);
    ast.body[0].hash.pairs[0].value.path = builders.path('zomg');

    assert.equal(
      print(ast),
      stripIndent`
        {{foo-bar
          baz=(zomg
            goes='here')
        }}`
    );
  });

  QUnit.todo('can remove during traversal by returning `null`', function(assert) {
    let template = stripIndent`
    <p>here is some multiline string</p>
    {{ other-stuff }}
    `;
    let { code } = transform(template, () => {
      return {
        ElementNode() {
          return null;
        },
      };
    });

    assert.equal(code, '\n{{ other-stuff }}');
  });

  QUnit.test('can replace with many items during traversal by returning an array', function(
    assert
  ) {
    let template = stripIndent`
    <p>here is some multiline string</p>
    {{other-stuff}}
    `;
    let { code } = transform(template, env => {
      let { builders: b } = env.syntax;

      return {
        ElementNode() {
          return [b.text('hello '), b.text('world')];
        },
      };
    });

    assert.equal(code, 'hello world\n{{other-stuff}}');
  });

  QUnit.todo('MustacheStatements retain whitespace when multiline replacements occur', function(
    assert
  ) {
    let template = stripIndent`
    <p></p>
    {{ other-stuff }}
    `;
    let { code } = transform(template, env => {
      let { builders: b } = env.syntax;

      return {
        ElementNode() {
          return [b.text('x'), b.text('y')];
        },
      };
    });

    assert.equal(code, 'xy\n{{ other-stuff }}');
  });
});

QUnit.module('transform', () => {
  QUnit.test('basic traversal', function(assert) {
    let template = '{{foo-bar bar=foo}}';
    let paths = [];
    transform(template, function() {
      return {
        PathExpression(node) {
          paths.push(node.original);
        },
      };
    });

    assert.deepEqual(paths, ['foo-bar', 'foo']);
  });

  QUnit.test('can handle comment append before html node case', function(assert) {
    let template = '<table></table>';
    let alreadyCommented = [];
    const result = transform(template, function({ syntax }) {
      const b = syntax.builders;
      return {
        ElementNode(node) {
          if (node.tag === 'table' && !alreadyCommented.find(c => c === node)) {
            alreadyCommented.push(node);
            return [b.mustacheComment(' template-lint-disable no-table-tag '), b.text('\n'), node];
          }
          return node;
        },
      };
    });

    assert.deepEqual(
      result.code,
      ['{{!-- template-lint-disable no-table-tag --}}', '<table></table'].join('\n')
    );
  });

  QUnit.test('can accept an AST', function(assert) {
    let template = '{{foo-bar bar=foo}}';
    let paths = [];
    let ast = parse(template);
    transform(ast, function() {
      return {
        PathExpression(node) {
          paths.push(node.original);
        },
      };
    });

    assert.deepEqual(paths, ['foo-bar', 'foo']);
  });

  QUnit.test('returns code and ast', function(assert) {
    let template = '{{foo-bar}}';
    let paths = [];
    let { ast, code } = transform(template, function() {
      return {
        PathExpression(node) {
          paths.push(node.original);
        },
      };
    });

    assert.ok(ast);
    assert.ok(code);
  });

  QUnit.test('mutations', function(assert) {
    let template = '{{foo-bar bar=foo}}';
    let { code } = transform(template, () => {
      return {
        PathExpression(node) {
          if (node.original === 'foo') {
            node.original = 'bar';
          }
          return node;
        },
      };
    });

    assert.equal(code, '{{foo-bar bar=bar}}');
  });

  QUnit.test('mutations retain formatting', function(assert) {
    let template = '{{foo-bar   bar= foo}}';
    let { code } = transform(template, () => {
      return {
        PathExpression(node) {
          if (node.original === 'foo') {
            node.original = 'bar';
          }
          return node;
        },
      };
    });

    assert.equal(code, '{{foo-bar   bar= bar}}');
  });

  QUnit.test('replacement', function(assert) {
    let template = '{{foo-bar bar=foo}}';
    let { code } = transform(template, env => {
      let { builders: b } = env.syntax;
      return {
        MustacheStatement() {
          return b.mustache(b.path('wat-wat'));
        },
      };
    });

    assert.equal(code, '{{wat-wat}}');
  });

  QUnit.test('replacing empty hash pair on BlockStatement works', function(assert) {
    let template = '{{#foo-bar}}Hi there!{{/foo-bar}}{{baz}}';
    let { code } = transform(template, env => {
      let { builders: b } = env.syntax;
      return {
        BlockStatement(ast) {
          ast.hash = b.hash([b.pair('hello', b.string('world'))]);
        },
      };
    });

    assert.equal(code, '{{#foo-bar hello="world"}}Hi there!{{/foo-bar}}{{baz}}');
  });

  QUnit.test('pushing new item on to empty hash pair on BlockStatement works', function(assert) {
    let template = '{{#foo-bar}}Hi there!{{/foo-bar}}{{baz}}';
    let { code } = transform(template, env => {
      let { builders: b } = env.syntax;
      return {
        BlockStatement(ast) {
          ast.hash.pairs.push(b.pair('hello', b.string('world')));
        },
      };
    });

    assert.equal(code, '{{#foo-bar hello="world"}}Hi there!{{/foo-bar}}{{baz}}');
  });

  // There's currently an issue trying to make multiple sequential changes
  // to an empty hash set. For now, if you need to add multiple items on to an
  // empty hash pair, better to build a hash and set the hash property on the
  // parent BlockStatement.
  QUnit.todo('pushing multiple new items on to empty hash pair works', function(assert) {
    let template = '{{#foo-bar}}Hi there!{{/foo-bar}}{{baz}}';
    let { code } = transform(template, env => {
      let { builders: b } = env.syntax;
      return {
        BlockStatement(ast) {
          ast.hash.pairs.push(b.pair('hello', b.string('world')), b.pair('foo', b.string('bar')));
        },
      };
    });

    assert.equal(code, '{{#foo-bar hello="world" foo="bar"}}Hi there!{{/foo-bar}}{{baz}}');
  });

  QUnit.test('replacing empty hash pair on a BlockStatement w/ block params works', function(
    assert
  ) {
    let template = '{{#foo-bar as |a b c|}}Hi there!{{/foo-bar}}{{baz}}';
    let { code } = transform(template, env => {
      let { builders: b } = env.syntax;
      return {
        BlockStatement(ast) {
          ast.hash = b.hash([b.pair('hello', b.string('world'))]);
        },
      };
    });

    assert.equal(code, '{{#foo-bar hello="world" as |a b c|}}Hi there!{{/foo-bar}}{{baz}}');
  });

  QUnit.test(
    'pushing new item on an empty hash on a BlockStatement w/ block params works',
    function(assert) {
      let template = '{{#foo-bar as |a b c|}}Hi there!{{/foo-bar}}{{baz}}';
      let { code } = transform(template, env => {
        let { builders: b } = env.syntax;
        return {
          BlockStatement(ast) {
            ast.hash.pairs.push(b.pair('hello', b.string('world')));
          },
        };
      });

      assert.equal(code, '{{#foo-bar hello="world" as |a b c|}}Hi there!{{/foo-bar}}{{baz}}');
    }
  );

  QUnit.test('replacing empty hash pair on MustacheStatement works', function(assert) {
    let template = '{{foo-bar}}{{#baz}}Hello!{{/baz}}';
    let { code } = transform(template, env => {
      let { builders: b } = env.syntax;
      return {
        MustacheStatement(ast) {
          ast.hash = b.hash([b.pair('hello', b.string('world'))]);
        },
      };
    });

    assert.equal(code, '{{foo-bar hello="world"}}{{#baz}}Hello!{{/baz}}');
  });

  QUnit.test('pushing new item on to empty hash pair on MustacheStatement works', function(assert) {
    let template = '{{foo-bar}}{{#baz}}Hello!{{/baz}}';
    let { code } = transform(template, env => {
      let { builders: b } = env.syntax;
      return {
        MustacheStatement(ast) {
          ast.hash.pairs.push(b.pair('hello', b.string('world')));
        },
      };
    });

    assert.equal(code, '{{foo-bar hello="world"}}{{#baz}}Hello!{{/baz}}');
  });
});

QUnit.module('whitespace and removed hash pairs', function() {
  QUnit.test('Multi-line removed hash pair causes line removal', function(assert) {
    let template = stripIndent`
      {{#foo-bar
        prop="abc"
        anotherProp=123
        yetAnotherProp="xyz"
      }}
        Hello!
      {{/foo-bar}}`;
    let { code } = transform(template, function(env) {
      let { builders: b } = env.syntax;
      return {
        HashPair(ast) {
          if (ast.key === 'anotherProp') {
            return b.text('');
          }
          return ast;
        },
      };
    });
    assert.equal(
      code,
      stripIndent`
      {{#foo-bar
        prop="abc"
        yetAnotherProp="xyz"
      }}
        Hello!
      {{/foo-bar}}`
    );
  });

  QUnit.test('whitespace is preserved when mutating a positional param', function(assert) {
    let template = stripIndent`
      {{some-helper positional}}
      {{#block positional}}
        empty
      {{/block}}
    `;

    let { code } = transform(template, function(env) {
      let { builders: b } = env.syntax;
      return {
        PathExpression(ast) {
          let token = ast.original;

          if (token === 'positional') {
            return b.path(`this.${token}`);
          }
        },
      };
    });
    assert.equal(
      code,
      stripIndent`
        {{some-helper this.positional}}
        {{#block this.positional}}
          empty
        {{/block}}
      `
    );
  });

  QUnit.test('Same-line removed hash pair from middle collapses excess whitespace', function(
    assert
  ) {
    let template = stripIndent`
    {{#hello-world}}
      {{#foo-bar prop="abc"  anotherProp=123  yetAnotherProp="xyz"}}
        Hello!
      {{/foo-bar}}
    {{/hello-world}}`;
    let { code } = transform(template, function(env) {
      let { builders: b } = env.syntax;
      return {
        HashPair(ast) {
          if (ast.key === 'anotherProp') {
            return b.text('');
          }
          return ast;
        },
      };
    });
    assert.equal(
      code,
      stripIndent`
      {{#hello-world}}
        {{#foo-bar prop="abc"  yetAnotherProp="xyz"}}
          Hello!
        {{/foo-bar}}
      {{/hello-world}}`
    );
  });

  QUnit.test('Whitespace properly collapsed when the removed prop is last', function(assert) {
    let template = stripIndent`
    {{#hello-world}}
      {{#foo-bar prop="abc" yetAnotherProp="xyz" anotherProp=123}}
        Hello!
      {{/foo-bar}}
    {{/hello-world}}`;
    let { code } = transform(template, function(env) {
      let { builders: b } = env.syntax;
      return {
        HashPair(ast) {
          if (ast.key === 'anotherProp') {
            return b.text('');
          }
          return ast;
        },
      };
    });
    assert.equal(
      code,
      stripIndent`
      {{#hello-world}}
        {{#foo-bar prop="abc" yetAnotherProp="xyz"}}
          Hello!
        {{/foo-bar}}
      {{/hello-world}}`
    );
  });

  QUnit.test(
    'Whitespace properly collapsed when the removed prop is last and the contents of the tag are spaced',
    function(assert) {
      let template = stripIndent`
      {{#hello-world}}
        {{ foo-bar prop="abc" yetAnotherProp="xyz" anotherProp=123 }}
      {{/hello-world}}`;
      let { code } = transform(template, function(env) {
        let { builders: b } = env.syntax;
        return {
          HashPair(ast) {
            if (ast.key === 'anotherProp') {
              return b.text('');
            }
            return ast;
          },
        };
      });
      assert.equal(
        code,
        stripIndent`
        {{#hello-world}}
          {{ foo-bar prop="abc" yetAnotherProp="xyz" }}
        {{/hello-world}}`
      );
    }
  );

  QUnit.test('Whitespace is left alone for replacements with whitespace on both sides', function(
    assert
  ) {
    let template = stripIndent`
      {{#hello-world foo="foo" bar="bar" as |yieldedProp|}}
        {{yieldedProp.something-something}}
      {{/hello-world}}`;
    let { code } = transform(template, function(env) {
      let { builders: b } = env.syntax;
      return {
        BlockStatement(ast) {
          const hashPairs = ast.hash.pairs;
          hashPairs.push(b.pair('somethingNew', b.string('Hello world!')));
          return ast;
        },
      };
    });
    assert.equal(
      code,
      stripIndent`
        {{#hello-world foo="foo" bar="bar" somethingNew="Hello world!" as |yieldedProp|}}
          {{yieldedProp.something-something}}
        {{/hello-world}}`,
      'Code is updated with new hash, and whitespace on both sides is preserved'
    );
  });
});

QUnit.module('multi-line', function(hooks) {
  let i = 0;
  hooks.beforeEach(() => (i = 0));
  function funkyIf(b) {
    return b.block(
      'if',
      [b.sexpr(b.path('a'))],
      null,
      b.program([b.text('\n'), b.text('  '), b.mustache(`${i++}`), b.text('\n'), b.text('\n')])
    );
  }

  QUnit.test('supports multi-line replacements', function(assert) {
    let template = stripIndent`
      {{bar}}

      {{foo}}`;
    let { code } = transform(template, function(env) {
      let { builders: b } = env.syntax;
      return {
        MustacheStatement(node) {
          if (node.loc.source === '(synthetic)') return node;
          return funkyIf(b);
        },
      };
    });

    assert.equal(
      code,
      stripIndent`
      {{#if (a)}}
        {{0}}

      {{/if}}

      {{#if (a)}}
        {{1}}

      {{/if}}
    `
    );
  });

  QUnit.test('collapsing lines (full line replacment)', function(assert) {
    let template = `
    here
    is
    some
    multiline
    string
    `;
    let { code } = transform(template, env => {
      let { builders: b } = env.syntax;

      return {
        TextNode() {
          return b.text(`here is a single line string`);
        },
      };
    });

    assert.equal(code, 'here is a single line string');
  });

  QUnit.test('collapsing lines when start line has non-replaced content', function(assert) {
    let template = stripIndent`
      <div
         data-foo={{baz}}></div>here
      is
      some
      multiline
      string`;
    let { code } = transform(template, env => {
      let { builders: b } = env.syntax;

      return {
        TextNode() {
          return b.text(`here is a single line string`);
        },
      };
    });

    assert.equal(code, '<div\n   data-foo={{baz}}></div>here is a single line string');
  });

  QUnit.test('collapsing lines when end line has non-replaced content', function(assert) {
    let template = stripIndent`
      here
      is
      some
      multiline
      string<div
      data-foo={{bar}}></div>`;

    let { code } = transform(template, env => {
      let { builders: b } = env.syntax;

      return {
        TextNode() {
          return b.text(`here is a single line string`);
        },
      };
    });

    assert.equal(code, 'here is a single line string<div\ndata-foo={{bar}}></div>');
  });

  QUnit.test('collapsing lines when start and end lines have non-replaced content', function(
    assert
  ) {
    let template = stripIndent`{{ foo }}
      here
      is
      some
      multiline
      string{{ bar }}`;
    let { code } = transform(template, env => {
      let { builders: b } = env.syntax;

      return {
        TextNode() {
          return b.text(`here is a single line string`);
        },
      };
    });

    assert.equal(code, '{{ foo }}here is a single line string{{ bar }}');
  });

  QUnit.test('Can handle multi-line column expansion', function(assert) {
    let template = `
    <div data-foo="bar"></div>here
    is
    some
    multiline
    string
    `;
    let { code } = transform(template, env => {
      let { builders: b } = env.syntax;

      return {
        TextNode() {
          return b.text(`${Array(10).join('x')}`);
        },
      };
    });

    assert.equal(
      code,
      `${Array(10).join('x')}<div data-foo=${Array(10).join('x')}></div>${Array(10).join('x')}`
    );
  });

  QUnit.test('supports multi-line replacements with interleaving', function(assert) {
    let template = stripIndent`
      <br>
      {{bar}}
      <div></div>
      {{foo}}
      <hr>`;
    let { code } = transform(template, function(env) {
      let { builders: b } = env.syntax;
      return {
        MustacheStatement(node) {
          if (node.loc.source === '(synthetic)') return node;
          return funkyIf(b);
        },
      };
    });

    assert.equal(
      code,
      stripIndent`
      <br>
      {{#if (a)}}
        {{0}}

      {{/if}}
      <div></div>
      {{#if (a)}}
        {{1}}

      {{/if}}
      <hr>
    `
    );
  });
});
