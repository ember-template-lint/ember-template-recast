import { parse, sourceForLoc, transform, builders, TransformPluginEnv } from '.';
import type { ASTv1 as AST, NodeVisitor } from '@glimmer/syntax';
import stripIndent from 'outdent';

describe('"real life" smoke tests', function () {
  describe('line endings', function () {
    test('preserves mixed line endings', function () {
      let template = `{{foo}}\r\n{{bar}}\n{{qux}}\r\n`;

      let expected = `{{oof}}\r\n{{rab}}\n{{xuq}}\r\n`;

      let { code } = transform(template, () => {
        return {
          MustacheStatement(node) {
            let path = node.path as AST.PathExpression;
            path.original = path.original.split('').reverse().join('');
          },
        };
      });

      expect(code).toEqual(expected);
    });
    test('preserves \\r\\n line endings', function () {
      let template = `{{foo}}\r\n{{bar}}\r\n`;

      let expected = `{{oof}}\r\n{{rab}}\r\n`;

      let { code } = transform(template, () => {
        return {
          MustacheStatement(node) {
            let path = node.path as AST.PathExpression;

            path.original = path.original.split('').reverse().join('');
          },
        };
      });

      expect(code).toEqual(expected);
    });

    test('preserves \\n line endings', function () {
      let template = `{{foo}}\n{{bar}}\n`;

      let expected = `{{oof}}\n{{rab}}\n`;

      let { code } = transform(template, () => {
        return {
          MustacheStatement(node) {
            let path = node.path as AST.PathExpression;

            path.original = path.original.split('').reverse().join('');
          },
        };
      });

      expect(code).toEqual(expected);
    });
  });

  describe('nested else conditionals GH#126', function () {
    test('without mutation', function () {
      let template = `
        {{#if a}}
          {{foo}}
        {{else if b}}
          {{bar}}
        {{else if c}}
          {{baz}}
        {{else}}
          {{qux}}
        {{/if}}
      `;

      let { code } = transform(template, () => {
        return {};
      });

      expect(code).toEqual(template);
    });

    test('with mutation inside component invocation with `else let` branches', function () {
      let template = `
        {{#foo-bar}}
          {{foo}}
        {{else let b as |baz|}}
          {{bar}}
        {{else}}
          {{qux}}
        {{/foo-bar}}
      `;

      let expected = `
        {{#foo-bar}}
          {{oof}}
        {{else let b as |baz|}}
          {{rab}}
        {{else}}
          {{xuq}}
        {{/foo-bar}}
      `;

      let { code } = transform(template, () => {
        return {
          MustacheStatement(node) {
            let path = node.path as AST.PathExpression;
            path.original = path.original.split('').reverse().join('');
          },
        };
      });

      expect(code).toEqual(expected);
    });

    test('with mutation inside component invocation with `else if` branches', function () {
      let template = `
        {{#foo-bar}}
          {{foo}}
        {{else if b}}
          {{bar}}
        {{else if c}}
          {{baz}}
        {{else}}
          {{qux}}
        {{/foo-bar}}
      `;

      let expected = `
        {{#foo-bar}}
          {{oof}}
        {{else if b}}
          {{rab}}
        {{else if c}}
          {{zab}}
        {{else}}
          {{xuq}}
        {{/foo-bar}}
      `;

      let { code } = transform(template, () => {
        return {
          MustacheStatement(node) {
            let path = node.path as AST.PathExpression;
            path.original = path.original.split('').reverse().join('');
          },
        };
      });

      expect(code).toEqual(expected);
    });

    test('with mutation inside `if`/`else if` branches', function () {
      let template = `
        {{#if a}}
          {{foo}}
        {{else if b}}
          {{bar}}
        {{else if c}}
          {{baz}}
        {{else}}
          {{qux}}
        {{/if}}
      `;

      let expected = `
        {{#if a}}
          {{oof}}
        {{else if b}}
          {{rab}}
        {{else if c}}
          {{zab}}
        {{else}}
          {{xuq}}
        {{/if}}
      `;

      let { code } = transform(template, () => {
        return {
          MustacheStatement(node) {
            let path = node.path as AST.PathExpression;

            path.original = path.original.split('').reverse().join('');
          },
        };
      });

      expect(code).toEqual(expected);
    });
  });

  describe('hash pair mutation order should not matter GH#86', function () {
    test('change, add, remove', function () {
      let template = stripIndent`
        {{foo-bar-baz
          unchanged="unchanged"
          hello="world"
          foo="bar"
        }}
      `;

      let { code } = transform(template, function (env) {
        let { builders: b } = env.syntax;

        return {
          Hash(node) {
            node.pairs.forEach((curr) => {
              if (curr.key === 'foo') {
                curr.value = b.string('baaaaar');
              }
            });
            node.pairs.push(b.pair('somethingnew', b.number(123)));
            node.pairs = node.pairs.filter((curr) => curr.key !== 'hello');
          },
        };
      });

      expect(code).toEqual(stripIndent`
        {{foo-bar-baz
          unchanged="unchanged"
          foo="baaaaar"
          somethingnew=123
        }}
      `);
    });

    test('remove, change, add', function () {
      let template = stripIndent`
        {{foo-bar-baz
          unchanged="unchanged"
          hello="world"
          foo="bar"
        }}
      `;

      let { code } = transform(template, function (env) {
        let { builders: b } = env.syntax;

        return {
          Hash(node) {
            node.pairs = node.pairs.filter((curr) => curr.key !== 'hello');
            node.pairs.forEach((curr) => {
              if (curr.key === 'foo') {
                curr.value = b.string('baaaaar');
              }
            });
            node.pairs.push(b.pair('somethingnew', b.number(123)));
          },
        };
      });

      expect(code).toEqual(stripIndent`
        {{foo-bar-baz
          unchanged="unchanged"
          foo="baaaaar"
          somethingnew=123
        }}
      `);
    });
  });

  describe('whitespace and removed hash pairs', function () {
    test('Multi-line removed hash pair causes line removal', function () {
      let template = stripIndent`
        {{#foo-bar
          prop="abc"
          anotherProp=123
          yetAnotherProp="xyz"
        }}
          Hello!
        {{/foo-bar}}`;

      let { code } = transform(template, function () {
        return {
          Hash(ast) {
            ast.pairs = ast.pairs.filter((pair) => pair.key !== 'anotherProp');
          },
        };
      });

      expect(code).toEqual(stripIndent`
        {{#foo-bar
          prop="abc"
          yetAnotherProp="xyz"
        }}
          Hello!
        {{/foo-bar}}`);
    });

    test('whitespace is preserved when mutating a positional param', function () {
      let template = stripIndent`
        {{some-helper positional}}
        {{#block positional}}
          empty
        {{/block}}
      `;

      let { code } = transform(template, function (env) {
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
      expect(code).toEqual(stripIndent`
        {{some-helper this.positional}}
        {{#block this.positional}}
          empty
        {{/block}}
      `);
    });

    test('Same-line removed hash pair from middle collapses excess whitespace', function () {
      let template = stripIndent`
        {{#hello-world}}
          {{#foo-bar prop="abc"  anotherProp=123  yetAnotherProp="xyz"}}
            Hello!
          {{/foo-bar}}
        {{/hello-world}}`;
      let { code } = transform(template, function () {
        return {
          Hash(ast) {
            ast.pairs = ast.pairs.filter((pair) => pair.key !== 'anotherProp');
          },
        };
      });

      expect(code).toEqual(stripIndent`
        {{#hello-world}}
          {{#foo-bar prop="abc"  yetAnotherProp="xyz"}}
            Hello!
          {{/foo-bar}}
        {{/hello-world}}`);
    });

    test('Whitespace properly collapsed when the removed prop is last', function () {
      let template = stripIndent`
        {{#hello-world}}
          {{#foo-bar prop="abc" yetAnotherProp="xyz" anotherProp=123}}
            Hello!
          {{/foo-bar}}
        {{/hello-world}}`;
      let { code } = transform(template, function () {
        return {
          Hash(ast) {
            ast.pairs = ast.pairs.filter((pair) => pair.key !== 'anotherProp');
          },
        };
      });
      expect(code).toEqual(stripIndent`
        {{#hello-world}}
          {{#foo-bar prop="abc" yetAnotherProp="xyz"}}
            Hello!
          {{/foo-bar}}
        {{/hello-world}}`);
    });

    test('Whitespace properly collapsed when the removed prop is last and the contents of the tag are spaced', function () {
      let template = stripIndent`
          {{#hello-world}}
            {{ foo-bar prop="abc" yetAnotherProp="xyz" anotherProp=123 }}
          {{/hello-world}}`;

      let { code } = transform(template, function () {
        return {
          Hash(ast) {
            ast.pairs = ast.pairs.filter((pair) => pair.key !== 'anotherProp');
          },
        };
      });

      expect(code).toEqual(stripIndent`
          {{#hello-world}}
            {{ foo-bar prop="abc" yetAnotherProp="xyz" }}
          {{/hello-world}}`);
    });

    test('Whitespace is left alone for replacements with whitespace on both sides', function () {
      let template = stripIndent`
          {{#hello-world foo="foo" bar="bar" as |yieldedProp|}}
            {{yieldedProp.something-something}}
          {{/hello-world}}`;
      let { code } = transform(template, function (env) {
        let { builders: b } = env.syntax;
        return {
          BlockStatement(ast) {
            const hashPairs = ast.hash.pairs;
            hashPairs.push(b.pair('somethingNew', b.string('Hello world!')));
            return ast;
          },
        };
      });
      expect(code).toEqual(stripIndent`
          {{#hello-world foo="foo" bar="bar" somethingNew="Hello world!" as |yieldedProp|}}
            {{yieldedProp.something-something}}
          {{/hello-world}}`);
    });
  });

  describe('multi-line', function () {
    let i = 0;

    beforeEach(() => (i = 0));

    function funkyIf(b: typeof builders) {
      return b.block(
        'if',
        [b.sexpr(b.path('a'))],
        null,
        b.program([b.text('\n'), b.text('  '), b.mustache(`${i++}`), b.text('\n'), b.text('\n')])
      );
    }

    test('supports multi-line replacements', function () {
      let template = stripIndent`
        {{bar}}

        {{foo}}`;
      let { code } = transform(template, function (env) {
        let { builders: b } = env.syntax;
        return {
          MustacheStatement(node) {
            if (node.loc.module === '(synthetic)') return node;
            return funkyIf(b);
          },
        };
      });

      expect(code).toEqual(stripIndent`
        {{#if (a)}}
          {{0}}

        {{/if}}

        {{#if (a)}}
          {{1}}

        {{/if}}
      `);
    });

    test('`if` branch containing whitespace controls', function () {
      let template = `
        {{#if foo~}}
          {{foo}}
        {{/if}}
      `;

      let expected = `
        {{#if foo~}}
          {{oof}}
        {{/if}}
      `;

      let { code } = transform(template, () => {
        return {
          MustacheStatement(node) {
            let path = node.path as AST.PathExpression;

            path.original = path.original.split('').reverse().join('');
          },
        };
      });

      expect(code).toEqual(expected);
    });

    test('collapsing lines (full line replacment)', function () {
      let template = stripIndent`
        here
        is
        some
        multiline
        string
      `;
      let { code } = transform(template, (env) => {
        let { builders: b } = env.syntax;

        return {
          TextNode() {
            return b.text(`here is a single line string`);
          },
        };
      });

      expect(code).toEqual('here is a single line string');
    });

    test('collapsing lines when start line has non-replaced content', function () {
      let template = stripIndent`
        <div
           data-foo={{baz}}></div>here
        is
        some
        multiline
        string`;
      let { code } = transform(template, (env) => {
        let { builders: b } = env.syntax;

        return {
          TextNode() {
            return b.text(`here is a single line string`);
          },
        };
      });

      expect(code).toEqual('<div\n   data-foo={{baz}}></div>here is a single line string');
    });

    test('collapsing lines when end line has non-replaced content', function () {
      let template = stripIndent`
        here
        is
        some
        multiline
        string<div
        data-foo={{bar}}></div>`;

      let { code } = transform(template, (env) => {
        let { builders: b } = env.syntax;

        return {
          TextNode() {
            return b.text(`here is a single line string`);
          },
        };
      });

      expect(code).toEqual('here is a single line string<div\ndata-foo={{bar}}></div>');
    });

    test('collapsing lines when start and end lines have non-replaced content', function () {
      let template = stripIndent`{{ foo }}
        here
        is
        some
        multiline
        string{{ bar }}`;
      let { code } = transform(template, (env) => {
        let { builders: b } = env.syntax;

        return {
          TextNode() {
            return b.text(`here is a single line string`);
          },
        };
      });

      expect(code).toEqual('{{ foo }}here is a single line string{{ bar }}');
    });

    test('Can handle multi-line column expansion', function () {
      let template = `
        <div data-foo="bar"></div>here
        is
        some
        multiline
        string
        `;
      let { code } = transform(template, (env) => {
        let { builders: b } = env.syntax;

        return {
          TextNode() {
            return b.text(`${Array(10).join('x')}`);
          },
        };
      });

      expect(code).toEqual(
        `${Array(10).join('x')}<div data-foo="${Array(10).join('x')}"></div>${Array(10).join('x')}`
      );
    });

    test('supports multi-line replacements with interleaving', function () {
      let template = stripIndent`
        <br>
        {{bar}}
        <div></div>
        {{foo}}
        <hr>`;
      let { code } = transform(template, function (env) {
        let { builders: b } = env.syntax;
        return {
          MustacheStatement(node) {
            if (node.loc.module === '(synthetic)') return node;
            return funkyIf(b);
          },
        };
      });

      expect(code).toEqual(stripIndent`
        <br>
        {{#if (a)}}
          {{0}}

        {{/if}}
        <div></div>
        {{#if (a)}}
          {{1}}

        {{/if}}
        <hr>
      `);
    });

    test('supports block param on a new line', function () {
      let template = stripIndent`
        <SomeComponent @arg={{property}} as
        |foo|>
        </SomeComponent>
      `;

      let { code } = transform(template, (env) => {
        let { builders: b } = env.syntax;
        return {
          AttrNode(node) {
            if (node.value.type === 'MustacheStatement') {
              node.value = b.mustache(`this.property`);
            }
          },
        };
      });

      expect(code).toEqual(
        stripIndent`
          <SomeComponent @arg={{this.property}} as
          |foo|>
          </SomeComponent>
        `
      );
    });
  });

  describe('angle-bracket-codemod mockup', function () {
    function isComponent(node: AST.MustacheStatement) {
      let path = node.path as AST.PathExpression;
      return ['foo-bar'].includes(path.original);
    }

    function transformTagName(key: string) {
      return key
        .split('-')
        .map((text) => text[0].toUpperCase() + text.slice(1))
        .join('');
    }

    function codemod(env: TransformPluginEnv): NodeVisitor {
      let b = env.syntax.builders;

      return {
        MustacheStatement(node) {
          if (!isComponent(node)) {
            return;
          }

          let path = node.path as AST.PathExpression;
          let tagName = transformTagName(path.original);

          return b.element(
            { name: tagName, selfClosing: true },
            {
              attrs: node.hash.pairs.map((pair) => {
                let value = b.mustache(pair.value);

                if (pair.value.type === 'SubExpression') {
                  value = pair.value as any;
                  value.type = 'MustacheStatement';
                }

                return b.attr(`@${pair.key}`, value);
              }),
            }
          );
        },
      };
    }

    test('works for simple mustache', function () {
      let template = `{{foo-bar baz=qux}}`;

      let { code } = transform(template, codemod);

      expect(code).toEqual(`<FooBar @baz={{qux}} />`);
    });

    test('preserves nested invocation whitespace', function () {
      let template = `{{foo-bar baz=(something\n  goes=here\n  and=here\n)}}`;

      let { code } = transform(template, codemod);

      expect(code).toEqual(`<FooBar @baz={{something\n  goes=here\n  and=here\n}} />`);
    });
  });

  test('If/else-if/else chains with edits early in the chain should be fully printed (GH #149)', function () {
    let template = `
      {{#if a}}
        {{foo}}
      {{else if b}}
        {{bar}}
      {{else if c}}
        {{baz}}
      {{else}}
        {{#if d}}
          {{qux}}
        {{/if}}
      {{/if}}
    `;

    let expected = `
      {{#if a}}
        {{oof}}
      {{else if b}}
        {{bar}}
      {{else if c}}
        {{baz}}
      {{else}}
        {{#if d}}
          {{qux}}
        {{/if}}
      {{/if}}
    `;

    let { code } = transform(template, () => {
      return {
        MustacheStatement(node) {
          let path = node.path as AST.PathExpression;

          if (path.original === 'foo') {
            path.original = 'oof';
          }
        },
      };
    });

    expect(code).toEqual(expected);
  });

  test('If/else-if/else chains with multiple edits are accurate (GH #149)', function () {
    let template = `
      {{#if a}}
        {{foo}}
      {{else if b}}
        {{bar}}
      {{else if c}}
        {{baz}}
      {{else}}
        {{#if d}}
          {{qux}}
        {{else}}
          {{quack}}
        {{/if}}
      {{/if}}
      <div class="hello-world">
        Hello!
      </div>
    `;

    let expected = `
      {{#if a}}
        {{oof}}
      {{else if b}}
        {{bar}}
      {{else if c}}
        {{baz}}
      {{else}}
        {{#if d}}
          {{qux}}
        {{else}}
          {{honk}}
        {{/if}}
      {{/if}}
      <div class="hello-world">
        Hello!
      </div>
    `;

    let { code } = transform(template, () => {
      return {
        MustacheStatement(node) {
          let path = node.path as AST.PathExpression;

          if (path.original === 'foo') {
            path.original = 'oof';
          }
          if (path.original === 'quack') {
            path.original = 'honk';
          }
        },
      };
    });

    expect(code).toEqual(expected);
  });

  test('mustache param slicing (GH #149)', function () {
    let template = `
      <SomeComponent
        class=""
        @foo=42
        @bar={{action this.baz}}
      />
    `;

    let expected = template;

    let { code } = transform(template, () => ({
      MustacheStatement(node) {
        node.params = node.params.slice();
      },
    }));

    expect(code).toEqual(expected);
  });

  test('reusing existing hash preserves spacing', function () {
    let template = '{{foo-bar (query-params foo="baz")}}';

    let { code } = transform(template, (env) => {
      let { builders: b } = env.syntax;

      return {
        MustacheStatement(node) {
          if (node.path.type === 'PathExpression' && node.path.original === 'foo-bar') {
            let models = node.params.slice();

            let lastParam = models[models.length - 1] as AST.SubExpression;

            let _qpParam = b.attr('@query', b.mustache(b.path('hash'), [], lastParam.hash));
            return b.element({ name: 'FooBar', selfClosing: true }, { attrs: [_qpParam] });
          }
        },
      };
    });

    expect(code).toEqual('<FooBar @query={{hash foo="baz"}} />');
  });

  describe('can modify attribute indentation', function () {
    function attributeIndentationFixer(env: TransformPluginEnv): NodeVisitor {
      const template = env.contents;
      const seen = new WeakSet();

      return {
        ElementNode(node) {
          // when returning a new node from a visitor hook the new node
          // is _also_ traversed, we want to avoid attempting to calculate
          // the source **again**
          if (seen.has(node)) {
            return node;
          }

          let startLocation = node.loc.start.column;
          let indentation = ' '.repeat(startLocation + 2);

          let parts = [...node.attributes, ...node.modifiers, ...node.comments];

          // decide if we should emit a single line or multiple
          let multiline = parts.length >= 2;

          let partsSource = parts
            .map((part) => sourceForLoc(template, part.loc))
            .map((partSource) => `${indentation}${partSource}`)
            .join(multiline ? '\n' : '');

          let blockParamsSource = '';
          if (node.blockParams.length > 0) {
            blockParamsSource = `${multiline ? '\n' : ''}${indentation}as |${node.blockParams.join(
              ' '
            )}|`;
          }

          let childrenSource =
            node.children.length > 0
              ? node.children.map((child) => sourceForLoc(template, child.loc)).join('')
              : '';

          let closingOpenSource = node.selfClosing ? '\n/>' : '\n>';
          let closingSource = node.selfClosing ? '' : `</${node.tag}>`;

          let replacementElementSource = [
            `<${node.tag}\n`,
            partsSource,
            blockParamsSource,
            closingOpenSource,
            childrenSource,
            closingSource,
          ].join('');

          let fakeElement = parse(replacementElementSource).body[0];
          seen.add(fakeElement);

          return fakeElement;
        },
      };
    }

    test('can modify the attribute indentation of selfClosing element', function () {
      let template = `
<Foo hmm="lol"
@bar={{derp}}
  data-wat="zozers"
  disabled />`;

      let { code } = transform(template, attributeIndentationFixer);

      expect(code).toEqual(`
<Foo
  hmm="lol"
  @bar={{derp}}
  data-wat="zozers"
  disabled
/>`);
    });

    test('can modify the attribute indentation of element with children', function () {
      let template = `
<Foo hmm="lol"
@bar={{derp}}
  data-wat="zozers"
  disabled>lol</Foo>`;

      let { code } = transform(template, attributeIndentationFixer);

      expect(code).toEqual(`
<Foo
  hmm="lol"
  @bar={{derp}}
  data-wat="zozers"
  disabled
>lol</Foo>`);
    });

    test('can modify the attribute indentation of element with block params', function () {
      let template = `
<Foo hmm="lol"
@bar={{derp}}
  data-wat="zozers"
  disabled
        as |some thing|
 >lol</Foo>`;

      let { code } = transform(template, attributeIndentationFixer);

      expect(code).toEqual(`
<Foo
  hmm="lol"
  @bar={{derp}}
  data-wat="zozers"
  disabled
  as |some thing|
>lol</Foo>`);
    });
  });

  test('can replace whole template (aka what a prettier autofixer would want to do)', function () {
    let template = `Foo baz {{haha}} derp`;

    let { code } = transform(template, (env) => {
      return {
        Program: {
          exit(node) {
            let replacement = `ZOMG other things here`;

            node.body = env.syntax.parse(replacement).body;
          },
        },
      };
    });

    expect(code).toEqual('ZOMG other things here');
  });

  test('preserve formatting when replacing a whole template', function () {
    let template = `<div data-foo
 data-bar="lol"
      some-other-thing={{haha}}>
</div>`;
    let replacement = `<div
data-foo
data-bar="lol"
some-other-thing={{haha}}></div>`;

    let { code } = transform(template, (env) => {
      return {
        Program: {
          exit(node) {
            let ast = env.syntax.parse(replacement);
            node.body = ast.body;
          },
        },
      };
    });

    expect(code).toEqual(replacement);
  });
});
