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
