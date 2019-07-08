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

  QUnit.test('infers indentation of hash when multiple HashPairs existed', function(assert) {
    let template = stripIndent`
      {{foo-bar
        baz="stuff"
        other='single quote'
      }}`;
    let ast = parse(template);
    ast.body[0].hash.pairs.push(builders.pair('some', builders.string('other-thing')));

    assert.equal(
      print(ast),
      stripIndent`
        {{foo-bar
          baz="stuff"
          other='single quote'
          some="other-thing"
        }}`
    );
  });

  QUnit.test('infers indentation of hash when no existing hash existed but params do', function(
    assert
  ) {
    let template = stripIndent`
      {{foo-bar
        someParam
      }}`;
    let ast = parse(template);
    ast.body[0].hash.pairs.push(builders.pair('some', builders.string('other-thing')));

    assert.equal(
      print(ast),
      stripIndent`
        {{foo-bar
          someParam
          some="other-thing"
        }}`
    );
  });

  QUnit.test('basic parse -> mutation -> print: preserves HTML entities', function(assert) {
    let template = stripIndent`<div>&nbsp;</div>`;
    let ast = parse(template);
    ast.body[0].children.push(builders.text('derp&nbsp;'));

    assert.equal(print(ast), stripIndent`<div>&nbsp;derp&nbsp;</div>`);
  });

  QUnit.module('ElementNode', function() {
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

    QUnit.test('rename element tagname without children', function(assert) {
      let template = stripIndent`
      <div></div>`;

      let ast = parse(template);
      ast.body[0].tag = 'a';

      assert.equal(print(ast), `<a></a>`);
    });

    QUnit.test('rename self-closing element tagname', function(assert) {
      let ast = parse('<Foo bar="baz"/>');

      ast.body[0].tag = 'Qux';

      assert.equal(print(ast), '<Qux bar="baz"/>');
    });

    QUnit.test('adding attribute when none originally existed', function(assert) {
      let template = stripIndent`
      <div></div>`;

      let ast = parse(template);
      ast.body[0].attributes.push(builders.attr('data-test', builders.string('wheee')));

      assert.equal(
        print(ast),
        stripIndent`
        <div data-test="wheee"></div>`
      );
    });

    QUnit.test('adding attribute to ElementNode with block params', function(assert) {
      let template = `<Foo as |bar|></Foo>`;

      let ast = parse(template);
      ast.body[0].attributes.push(builders.attr('data-test', builders.string('wheee')));

      assert.equal(print(ast), `<Foo data-test="wheee" as |bar|></Foo>`);
    });

    QUnit.test('adding attribute to ElementNode with block params (extra whitespace)', function(
      assert
    ) {
      let template = stripIndent`<Foo as |
        bar
          |></Foo>`;

      let ast = parse(template);
      ast.body[0].attributes.push(builders.attr('data-test', builders.string('wheee')));

      assert.equal(
        print(ast),
        stripIndent`<Foo data-test="wheee" as |
        bar
          |></Foo>`
      );
    });

    QUnit.test('adding an attribute to existing list', function(assert) {
      let template = stripIndent`
      <div
        data-foo='lol'
        data-bar=hahaha
      ></div>`;

      let ast = parse(template);
      ast.body[0].attributes.push(builders.attr('data-test', builders.string('wheee')));

      assert.equal(
        print(ast),
        stripIndent`
        <div
          data-foo='lol'
          data-bar=hahaha
          data-test="wheee"
        ></div>`
      );
    });

    QUnit.test('adding modifier when no open parts originally existed', function(assert) {
      let template = stripIndent`
      <div></div>`;

      let ast = parse(template);
      ast.body[0].modifiers.push(
        builders.elementModifier('on', [builders.string('click'), builders.path('this.foo')])
      );

      assert.equal(
        print(ast),
        stripIndent`
        <div {{on "click" this.foo}}></div>`
      );
    });

    QUnit.test('adding modifier with existing attributes', function(assert) {
      let template = stripIndent`
      <div class="foo"></div>`;

      let ast = parse(template);
      ast.body[0].modifiers.push(
        builders.elementModifier('on', [builders.string('click'), builders.path('this.foo')])
      );

      assert.equal(
        print(ast),
        stripIndent`
        <div class="foo" {{on "click" this.foo}}></div>`
      );
    });

    QUnit.test('removing a modifier with other attributes', function(assert) {
      let template = stripIndent`
      <div class="foo" {{on "click" this.blah}}></div>`;

      let ast = parse(template);
      ast.body[0].modifiers.shift();

      assert.equal(
        print(ast),
        stripIndent`
        <div class="foo"></div>`
      );
    });

    QUnit.test('removing a modifier with no other attributes/comments/modifiers', function(assert) {
      let template = stripIndent`
      <div {{on "click" this.blah}}></div>`;

      let ast = parse(template);
      ast.body[0].modifiers.shift();

      assert.equal(
        print(ast),
        stripIndent`
        <div></div>`
      );
    });

    QUnit.test('adding comment when no open parts originally existed', function(assert) {
      let template = stripIndent`
      <div></div>`;

      let ast = parse(template);
      ast.body[0].comments.push(builders.mustacheComment(' template-lint-disable '));

      assert.equal(
        print(ast),
        stripIndent`
        <div {{!-- template-lint-disable --}}></div>`
      );
    });

    QUnit.test('adding comment with existing attributes', function(assert) {
      let template = stripIndent`
      <div class="foo"></div>`;

      let ast = parse(template);
      ast.body[0].comments.push(builders.mustacheComment(' template-lint-disable '));

      assert.equal(
        print(ast),
        stripIndent`
        <div class="foo" {{!-- template-lint-disable --}}></div>`
      );
    });

    QUnit.test('adding block param', function(assert) {
      let template = `<MyFoo class="foo"></MyFoo>`;

      let ast = parse(template);
      ast.body[0].blockParams.push('blah');

      assert.equal(print(ast), `<MyFoo class="foo" as |blah|></MyFoo>`);
    });

    QUnit.test('removing a block param', function(assert) {
      let template = `<MyFoo class="foo" as |bar|></MyFoo>`;

      let ast = parse(template);
      ast.body[0].blockParams.pop();

      assert.equal(print(ast), `<MyFoo class="foo"></MyFoo>`);
    });

    QUnit.test('removing a block param preserves formatting of "open element closing"', function(
      assert
    ) {
      let template = stripIndent`
        <MyFoo
          class="foo"
          as |bar|
        ></MyFoo>`;

      let ast = parse(template);
      ast.body[0].blockParams.pop();

      assert.equal(
        print(ast),
        stripIndent`
        <MyFoo
          class="foo"
        ></MyFoo>`
      );
    });
    QUnit.skip('interleaved attributes and modifiers are not modified when unchanged');
    QUnit.skip('adding children to self-closing element');
  });

  QUnit.module('MustacheStatement', function() {
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

    QUnit.test('MustacheStatements retain whitespace when multiline replacements occur', function(
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

    QUnit.test('can add param', function(assert) {
      let template = stripIndent`
        {{foo-bar
          baz=(stuff
            goes='here')
        }}`;

      let ast = parse(template);
      ast.body[0].params.push(builders.path('zomg'));

      assert.equal(
        print(ast),
        stripIndent`
          {{foo-bar
            zomg
            baz=(stuff
              goes='here')
          }}`
      );
    });

    QUnit.test('can remove param', function(assert) {
      let template = stripIndent`
        {{foo-bar
          hhaahahaha
          baz=(stuff
            goes='here')
        }}`;

      let ast = parse(template);
      ast.body[0].params.pop();

      assert.equal(
        print(ast),
        stripIndent`
          {{foo-bar
            baz=(stuff
              goes='here')
          }}`
      );
    });

    QUnit.test('replacing empty hash pair on MustacheStatement works', function(assert) {
      let template = '{{foo-bar}}';

      let ast = parse(template);
      ast.body[0].hash = builders.hash([builders.pair('hello', builders.string('world'))]);

      assert.equal(print(ast), stripIndent`{{foo-bar hello="world"}}`);
    });
  });

  QUnit.module('SubExpression', function() {
    QUnit.test('rename path', function(assert) {
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

    QUnit.test('can add param', function(assert) {
      let template = stripIndent`
        {{foo-bar
          baz=(stuff
            goes='here')
        }}`;

      let ast = parse(template);
      ast.body[0].hash.pairs[0].value.params.push(builders.path('zomg'));

      assert.equal(
        print(ast),
        stripIndent`
          {{foo-bar
            baz=(stuff
              zomg
              goes='here')
          }}`
      );
    });

    QUnit.test('can remove param', function(assert) {
      let template = stripIndent`
        {{foo-bar
          baz=(stuff
            hhaahahaha
            goes='here')
        }}`;

      let ast = parse(template);
      ast.body[0].hash.pairs[0].value.params.pop();

      assert.equal(
        print(ast),
        stripIndent`
          {{foo-bar
            baz=(stuff
              goes='here')
          }}`
      );
    });

    QUnit.test('replacing empty hash pair', function(assert) {
      let template = stripIndent`
        {{foo-bar
          baz=(stuff)
        }}`;

      let ast = parse(template);
      ast.body[0].hash.pairs[0].value.hash = builders.hash([
        builders.pair('hello', builders.string('world')),
      ]);

      assert.equal(print(ast), stripIndent`{{foo-bar\n  baz=(stuff hello="world")\n}}`);
    });
  });

  QUnit.module('BlockStatement', function() {
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

    QUnit.test('replacing a previously empty hash', function(assert) {
      let template = `{{#foo-bar}}Hi there!{{/foo-bar}}`;

      let ast = parse(template);
      ast.body[0].hash = builders.hash([builders.pair('hello', builders.string('world'))]);

      assert.equal(print(ast), '{{#foo-bar hello="world"}}Hi there!{{/foo-bar}}');
    });

    QUnit.test('adding multiple HashPair to previously empty hash', function(assert) {
      let template = '{{#foo-bar}}Hi there!{{/foo-bar}}{{baz}}';

      let ast = parse(template);
      ast.body[0].hash.pairs.push(builders.pair('hello', builders.string('world')));
      ast.body[0].hash.pairs.push(builders.pair('foo', builders.string('bar')));

      assert.equal(print(ast), '{{#foo-bar hello="world" foo="bar"}}Hi there!{{/foo-bar}}{{baz}}');
    });

    QUnit.test('replacing empty hash w/ block params works', function(assert) {
      let template = `{{#foo-bar as |a b c|}}Hi there!{{/foo-bar}}`;

      let ast = parse(template);
      ast.body[0].hash = builders.hash([builders.pair('hello', builders.string('world'))]);

      assert.equal(print(ast), '{{#foo-bar hello="world" as |a b c|}}Hi there!{{/foo-bar}}');
    });

    QUnit.test('adding new HashPair to an empty hash w/ block params works', function(assert) {
      let template = `{{#foo-bar as |a b c|}}Hi there!{{/foo-bar}}`;

      let ast = parse(template);
      ast.body[0].hash.pairs.push(builders.pair('hello', builders.string('world')));

      assert.equal(print(ast), '{{#foo-bar hello="world" as |a b c|}}Hi there!{{/foo-bar}}');
    });

    QUnit.skip('add param');
    QUnit.skip('add block param');
    QUnit.skip('remove block param');
    QUnit.skip('add inverse');
    QUnit.skip('remove inverse');
    QUnit.skip('add child to end of program');
    QUnit.skip('add child to beginning of program');
    QUnit.skip('add child to end of inverse');
    QUnit.skip('add child to beginning of inverse');
    QUnit.skip('{{else if foo}} chaining');
  });

  QUnit.module('HashPair', function() {
    QUnit.test('mutations', function(assert) {
      let template = '{{foo-bar bar=foo}}';

      let ast = parse(template);
      ast.body[0].hash.pairs[0].value.original = 'bar';

      assert.equal(print(ast), '{{foo-bar bar=bar}}');
    });

    QUnit.test('mutations retain formatting', function(assert) {
      let template = '{{foo-bar   bar= foo}}';

      let ast = parse(template);
      ast.body[0].hash.pairs[0].value.original = 'bar';

      assert.equal(print(ast), '{{foo-bar   bar= bar}}');
    });
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

  QUnit.skip('supports removing an {{else if foo}} condition');
  QUnit.skip('supports adding a block param');
  QUnit.skip('supports removing a block param');
  QUnit.skip('supports updating the various literal types');
  QUnit.skip('supports changing element node tagname and adding attributes');
  QUnit.skip('preserves whitespace on mustache statement end -> hash mutation');
  QUnit.skip('preserves whitespace on mustache statement end -> params mutation');
  QUnit.skip('preserves whitespace on mustache statement end -> path mutation');
  QUnit.skip('update path on ambiguous mustache statement');
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
    let seen = new Set();

    const result = transform(template, function({ syntax }) {
      const b = syntax.builders;

      return {
        ElementNode(node) {
          if (node.tag === 'table' && !seen.has(node)) {
            seen.add(node);

            return [b.mustacheComment(' template-lint-disable no-table-tag '), b.text('\n'), node];
          }
          return node;
        },
      };
    });

    assert.deepEqual(
      result.code,
      ['{{!-- template-lint-disable no-table-tag --}}', '<table></table>'].join('\n')
    );
  });

  QUnit.test('can handle comment append between html + newline', function(assert) {
    let template = ['\n', '<table>', '<tbody></tbody>', '</table>'].join('\n');
    let seen = new Set();

    const result = transform(template, function({ syntax }) {
      const b = syntax.builders;

      return {
        ElementNode(node) {
          if (node.tag === 'table' && !seen.has(node)) {
            seen.add(node);

            return [b.mustacheComment(' template-lint-disable no-table-tag '), b.text('\n'), node];
          }
          return node;
        },
      };
    });

    assert.deepEqual(
      result.code,
      [
        '\n',
        '{{!-- template-lint-disable no-table-tag --}}',
        '<table>',
        '<tbody></tbody>',
        '</table>',
      ].join('\n')
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

  QUnit.test('removing the only hash pair on MustacheStatement', function(assert) {
    let template = '{{foo-bar hello="world"}}';
    let { code } = transform(template, () => {
      return {
        MustacheStatement(ast) {
          ast.hash.pairs.pop();
        },
      };
    });

    assert.equal(code, '{{foo-bar}}');
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

    let { code } = transform(template, function() {
      return {
        Hash(ast) {
          ast.pairs = ast.pairs.filter(pair => pair.key !== 'anotherProp');
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
    let { code } = transform(template, function() {
      return {
        Hash(ast) {
          ast.pairs = ast.pairs.filter(pair => pair.key !== 'anotherProp');
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
    let { code } = transform(template, function() {
      return {
        Hash(ast) {
          ast.pairs = ast.pairs.filter(pair => pair.key !== 'anotherProp');
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

      let { code } = transform(template, function() {
        return {
          Hash(ast) {
            ast.pairs = ast.pairs.filter(pair => pair.key !== 'anotherProp');
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
