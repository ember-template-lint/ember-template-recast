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
