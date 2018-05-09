const { parse, print } = require('..');
const { stripIndent } = require('common-tags');

QUnit.module('ember-template-recast', function() {
  QUnit.test('basic parse + print (no modification)', function(assert) {
    let template = stripIndent`
      {{foo-bar
        baz="stuff"
      }}
    `;
    let ast = parse(template);

    assert.equal(print(ast), template);
  });
});
