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

              return [
                b.mustacheComment(' template-lint-disable no-table-tag '),
                b.text('\n'),
                node,
              ];
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

              return [
                b.mustacheComment(' template-lint-disable no-table-tag '),
                b.text('\n'),
                node,
              ];
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

    QUnit.test('pushing new item on to empty hash pair on MustacheStatement works', function(
      assert
    ) {
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

    QUnit.test('nested else-if', function(assert) {
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
            node.path.original = node.path.original
              .split('')
              .reverse()
              .join('');
          },
        };
      });

      assert.equal(code, expected);
    });
  });
});
