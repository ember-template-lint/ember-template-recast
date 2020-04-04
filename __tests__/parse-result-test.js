const { parse, print, transform } = require('..');
const { builders } = require('@glimmer/syntax');
const { stripIndent } = require('common-tags');

QUnit.module('ember-template-recast', function () {
  QUnit.module('ElementNode', function () {
    QUnit.test('creating void element', function (assert) {
      let template = ``;

      let ast = parse(template);
      ast.body.push(builders.element('img'));

      assert.equal(print(ast), `<img>`);
    });

    QUnit.test('updating attributes on a non-self-closing void element', function (assert) {
      let template = `<img src="{{something}}">`;

      let ast = parse(template);
      ast.body[0].attributes[0].value.parts[0].path = builders.path('this.something');

      assert.equal(print(ast), `<img src="{{this.something}}">`);
    });

    QUnit.test('changing an element to a void element does not print closing tag', function (
      assert
    ) {
      let template = `<div data-foo="{{something}}"></div>`;

      let ast = parse(template);
      ast.body[0].tag = 'img';

      assert.equal(print(ast), `<img data-foo="{{something}}">`);
    });

    QUnit.test('updating attributes on a self-closing void element', function (assert) {
      let template = `<img src="{{something}}" />`;

      let ast = parse(template);
      ast.body[0].attributes[0].value.parts[0].path = builders.path('this.something');

      assert.equal(print(ast), `<img src="{{this.something}}" />`);
    });

    QUnit.test('changing an attribute value from mustache to text node (GH#111)', function (
      assert
    ) {
      let template = `<FooBar @thing={{1234}} @baz={{derp}} />`;

      let ast = parse(template);
      ast.body[0].attributes[0].value = builders.text('static thing 1');
      ast.body[0].attributes[1].value = builders.text('static thing 2');

      assert.equal(print(ast), `<FooBar @thing="static thing 1" @baz="static thing 2" />`);
    });

    QUnit.test('changing an attribute value from text node to mustache (GH #139)', function (
      assert
    ) {
      let template = `<FooBar @foo="Hi, I'm a string!" />`;

      let ast = parse(template);
      ast.body[0].attributes[0].value = builders.mustache('my-awesome-helper', [
        builders.string('hello'),
        builders.string('world'),
      ]);

      assert.equal(print(ast), `<FooBar @foo={{my-awesome-helper "hello" "world"}} />`);
    });

    QUnit.test(
      'changing an attribute value from text node to concat statement (GH #139)',
      function (assert) {
        let template = `<FooBar @foo="Hi, I'm a string!" />`;

        let ast = parse(template);
        ast.body[0].attributes[0].value = builders.concat([
          builders.text('Hello '),
          builders.mustache('my-awesome-helper', [
            builders.string('hello'),
            builders.string('world'),
          ]),
          builders.text(' world'),
        ]);

        assert.equal(
          print(ast),
          `<FooBar @foo="Hello {{my-awesome-helper "hello" "world"}} world" />`
        );
      }
    );

    QUnit.test('changing an attribute value from mustache to mustache', function (assert) {
      let template = `<FooBar @foo={{12345}} />`;

      let ast = parse(template);
      ast.body[0].attributes[0].value = builders.mustache('my-awesome-helper', [
        builders.string('hello'),
        builders.string('world'),
      ]);

      assert.equal(print(ast), `<FooBar @foo={{my-awesome-helper "hello" "world"}} />`);
    });

    QUnit.test('rename element tagname', function (assert) {
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

    QUnit.test('rename element tagname without children', function (assert) {
      let template = stripIndent`
      <div></div>`;

      let ast = parse(template);
      ast.body[0].tag = 'a';

      assert.equal(print(ast), `<a></a>`);
    });

    QUnit.test('rename self-closing element tagname', function (assert) {
      let ast = parse('<Foo bar="baz"/>');

      ast.body[0].tag = 'Qux';

      assert.equal(print(ast), '<Qux bar="baz"/>');
    });

    QUnit.test('rename self-closing element tagname with trailing whitespace', function (assert) {
      let ast = parse('<Foo />');

      ast.body[0].tag = 'Qux';

      assert.equal(print(ast), '<Qux />');
    });

    QUnit.test(
      'Rename tag and convert from self-closing with attributes to block element',
      function (assert) {
        let ast = parse('<Foo bar="baz" />');

        ast.body[0].tag = 'Qux';
        ast.body[0].children = [builders.text('bay')];

        assert.equal(print(ast), '<Qux bar="baz">bay</Qux>');
      }
    );

    QUnit.test('convert from self-closing with attributes to block element', function (assert) {
      let ast = parse('<Foo bar="baz" />');

      ast.body[0].children = [builders.text('bay')];

      assert.equal(print(ast), '<Foo bar="baz">bay</Foo>');
    });

    QUnit.test(
      'convert from self-closing with specially spaced attributes to block element',
      function (assert) {
        let ast = parse('<Foo\n  bar="baz"\n />');

        ast.body[0].children = [builders.text('bay')];

        assert.equal(print(ast), '<Foo\n  bar="baz"\n >bay</Foo>');
      }
    );

    QUnit.test('Convert self-closing element with modifiers block element', function (assert) {
      let ast = parse('<Foo {{on "click" this.doSomething}} />');

      ast.body[0].children = [builders.text('bay')];

      assert.equal(print(ast), '<Foo {{on "click" this.doSomething}}>bay</Foo>');
    });

    QUnit.test('adding attribute when none originally existed', function (assert) {
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

    QUnit.test('adding attribute to ElementNode with block params', function (assert) {
      let template = `<Foo as |bar|></Foo>`;

      let ast = parse(template);
      ast.body[0].attributes.push(builders.attr('data-test', builders.string('wheee')));

      assert.equal(print(ast), `<Foo data-test="wheee" as |bar|></Foo>`);
    });

    QUnit.test('adding attribute to ElementNode with block params (extra whitespace)', function (
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

    QUnit.test('adding boolean attribute to ElementNode', function (assert) {
      let template = stripIndent`<button></button>`;

      let ast = parse(template);
      ast.body[0].attributes.push(
        builders.attr('disabled', builders.mustache(builders.boolean(true)))
      );

      assert.equal(print(ast), '<button disabled={{true}}></button>');
    });

    QUnit.test('adding an attribute to existing list', function (assert) {
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

    QUnit.test('creating an element with complex attributes', function (assert) {
      let template = '';

      let ast = parse(template);

      ast.body.push(
        builders.element(
          { name: 'FooBar', selfClosing: true },
          {
            attrs: [
              builders.attr(
                '@thing',
                builders.mustache(
                  builders.path('hash'),
                  [],
                  builders.hash([builders.pair('something', builders.path('bar'))])
                )
              ),
            ],
          }
        )
      );

      assert.equal(print(ast), `<FooBar @thing={{hash something=bar}} />`);
    });

    QUnit.test('modifying an attribute name (GH#112)', function (assert) {
      let template = stripIndent`
        <div
          data-foo='some thing here'
          data-bar=hahaha
        ></div>`;

      let ast = parse(template);
      ast.body[0].attributes[0].name = 'data-test';

      assert.equal(
        print(ast),
        stripIndent`
          <div
            data-test='some thing here'
            data-bar=hahaha
          ></div>`
      );
    });

    QUnit.test('modifying attribute after valueless attribute', function (assert) {
      let template = '<Foo data-foo data-derp={{hmmm}} />';

      let ast = parse(template);
      ast.body[0].attributes[1].value.path = builders.path('this.hmmm');

      assert.equal(print(ast), '<Foo data-foo data-derp={{this.hmmm}} />');
    });

    QUnit.test('modifying attribute after valueless attribute with special whitespace', function (
      assert
    ) {
      let template = stripIndent`
        <Foo
          data-foo
          data-derp={{hmmm}}
        />`;

      let ast = parse(template);
      ast.body[0].attributes[1].value.path = builders.path('this.hmmm');

      assert.equal(
        print(ast),
        stripIndent`
          <Foo
            data-foo
            data-derp={{this.hmmm}}
          />`
      );
    });

    QUnit.test('adding attribute after valueless attribute', function (assert) {
      let template = '<Foo data-foo />';

      let ast = parse(template);
      ast.body[0].attributes.push(builders.attr('data-bar', builders.text('foo')));

      assert.equal(print(ast), '<Foo data-foo data-bar="foo" />');
    });

    QUnit.test('adding valueless attribute when no open parts existed', function (assert) {
      let template = '<Foo />';

      let ast = parse(template);
      ast.body[0].attributes.push(builders.attr('data-bar', builders.text('')));

      assert.equal(print(ast), '<Foo data-bar />');
    });

    QUnit.test('adding modifier when no open parts originally existed', function (assert) {
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

    QUnit.test('adding modifier with existing attributes', function (assert) {
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

    // This is specifically testing the issue described in https://github.com/glimmerjs/glimmer-vm/pull/953
    QUnit.test('adding modifier when ...attributes is present', function (assert) {
      let template = stripIndent`<div data-foo="asdf" data-foo data-other="asdf"></div>`;

      let ast = parse(template);
      ast.body[0].modifiers.push(
        builders.elementModifier('on', [builders.string('click'), builders.path('this.foo')])
      );

      assert.equal(
        print(ast),
        `<div data-foo="asdf" data-foo data-other="asdf" {{on "click" this.foo}}></div>`
      );
    });

    QUnit.test('removing a modifier with other attributes', function (assert) {
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

    QUnit.test('removing a modifier with no other attributes/comments/modifiers', function (
      assert
    ) {
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

    QUnit.test('adding comment when no open parts originally existed', function (assert) {
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

    QUnit.test('adding comment with existing attributes', function (assert) {
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

    QUnit.test('adding block param', function (assert) {
      let template = `<MyFoo class="foo"></MyFoo>`;

      let ast = parse(template);
      ast.body[0].blockParams.push('blah');

      assert.equal(print(ast), `<MyFoo class="foo" as |blah|></MyFoo>`);
    });

    QUnit.test('removing a block param', function (assert) {
      let template = `<MyFoo class="foo" as |bar|></MyFoo>`;

      let ast = parse(template);
      ast.body[0].blockParams.pop();

      assert.equal(print(ast), `<MyFoo class="foo"></MyFoo>`);
    });

    QUnit.test('removing a block param preserves formatting of "open element closing"', function (
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

    QUnit.test('interleaved attributes and modifiers are not modified when unchanged', function (
      assert
    ) {
      let template = `<div data-test="foo" {{on "click" this.bar}} data-blah="derp"></div>`;

      let ast = parse(template);
      ast.body[0].comments.push(builders.mustacheComment(' template-lint-disable '));

      assert.equal(
        print(ast),
        `<div data-test="foo" {{on "click" this.bar}} data-blah="derp" {{!-- template-lint-disable --}}></div>`
      );
    });

    QUnit.test('adding children to element with children', function (assert) {
      let template = stripIndent`
        <ul>
          <li></li>
        </ul>
      `;

      let ast = parse(template);
      ast.body[0].children.splice(
        2,
        0,
        builders.text('\n  '),
        builders.element('li', { attrs: [builders.attr('data-foo', builders.text('bar'))] })
      );

      assert.equal(
        print(ast),
        stripIndent`
          <ul>
            <li></li>
            <li data-foo="bar"></li>
          </ul>
        `
      );
    });

    QUnit.test('adding children to an empty element', function (assert) {
      let template = `<div></div>`;

      let ast = parse(template);
      ast.body[0].children.push(builders.text('some text'));

      assert.equal(print(ast), '<div>some text</div>');
    });

    QUnit.test('adding children to a self closing element', function (assert) {
      let template = `<Foo />`;

      let ast = parse(template);
      ast.body[0].children.push(builders.text('some text'));

      assert.equal(print(ast), '<Foo>some text</Foo>');
    });

    QUnit.test('moving a child to another ElementNode', function (assert) {
      let template = stripIndent`
        <Foo>{{
          special-formatting-here
        }}</Foo>
      `;

      let ast = parse(template);
      let child = ast.body[0].children.pop();
      ast.body.unshift(builders.text('\n'));
      ast.body.unshift(child);

      assert.equal(
        print(ast),
        stripIndent`
          {{
            special-formatting-here
          }}
          <Foo></Foo>
        `
      );
    });
  });

  QUnit.module('MustacheStatement', function () {
    QUnit.test('path mutations retain custom whitespace formatting', function (assert) {
      let template = `{{ foo }}`;

      let ast = parse(template);
      ast.body[0].path.original = 'bar';

      assert.equal(print(ast), '{{ bar }}');
    });

    QUnit.test('updating from this.foo to @foo via path.original mutation', function (assert) {
      let template = `{{this.foo}}`;

      let ast = parse(template);
      ast.body[0].path.original = '@foo';

      assert.equal(print(ast), '{{@foo}}');
    });

    QUnit.test('updating from this.foo to @foo via path replacement', function (assert) {
      let template = `{{this.foo}}`;

      let ast = parse(template);
      ast.body[0].path = builders.path('@foo');

      assert.equal(print(ast), '{{@foo}}');
    });

    QUnit.test('updating path via path replacement retains custom whitespace', function (assert) {
      let template = `{{\n@foo\n}}`;

      let ast = parse(template);
      ast.body[0].path = builders.path('this.foo');

      assert.equal(print(ast), '{{\nthis.foo\n}}');
    });

    QUnit.test('rename non-block component', function (assert) {
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

    QUnit.test('MustacheStatements retain whitespace when multiline replacements occur', function (
      assert
    ) {
      let template = stripIndent`
        <p></p>
        {{ other-stuff }}
      `;
      let { code } = transform(template, (env) => {
        let { builders: b } = env.syntax;

        return {
          ElementNode() {
            return [b.text('x'), b.text('y')];
          },
        };
      });

      assert.equal(code, 'xy\n{{ other-stuff }}');
    });

    QUnit.test('can add param', function (assert) {
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

    QUnit.test('can remove param', function (assert) {
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

    QUnit.test('replacing empty hash pair on MustacheStatement works', function (assert) {
      let template = '{{foo-bar}}';

      let ast = parse(template);
      ast.body[0].hash = builders.hash([builders.pair('hello', builders.string('world'))]);

      assert.equal(print(ast), stripIndent`{{foo-bar hello="world"}}`);
    });

    QUnit.test('infers indentation of hash when multiple HashPairs existed', function (assert) {
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

    QUnit.test('infers indentation of hash when no existing hash existed but params do', function (
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

    QUnit.test(
      'infers indentation of new HashPairs when existing hash with single entry (but no params)',
      function (assert) {
        let template = stripIndent`
        {{foo-bar
          stuff=here
        }}`;
        let ast = parse(template);
        ast.body[0].hash.pairs.push(builders.pair('some', builders.string('other-thing')));

        assert.equal(
          print(ast),
          stripIndent`
          {{foo-bar
            stuff=here
            some="other-thing"
          }}`
        );
      }
    );

    QUnit.test('can add literal hash pair values', function (assert) {
      let template = stripIndent`
        {{foo-bar
          first=thing
        }}`;

      let ast = parse(template);
      ast.body[0].hash.pairs.push(builders.pair('some', builders.null()));
      ast.body[0].hash.pairs.push(builders.pair('other', builders.undefined()));
      ast.body[0].hash.pairs.push(builders.pair('things', builders.boolean(true)));
      ast.body[0].hash.pairs.push(builders.pair('go', builders.number(42)));
      ast.body[0].hash.pairs.push(builders.pair('here', builders.boolean(false)));

      assert.equal(
        print(ast),
        stripIndent`
          {{foo-bar
            first=thing
            some=null
            other=undefined
            things=true
            go=42
            here=false
          }}`
      );
    });
  });

  QUnit.module('SubExpression', function () {
    QUnit.test('rename path', function (assert) {
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

    QUnit.test('can add param', function (assert) {
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

    QUnit.test('can remove param', function (assert) {
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

    QUnit.test('replacing empty hash pair', function (assert) {
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

  QUnit.module('BlockStatement', function () {
    QUnit.test('rename block component', function (assert) {
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

    QUnit.test('rename block component from longer to shorter name', function (assert) {
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

    QUnit.test('replacing a previously empty hash', function (assert) {
      let template = `{{#foo-bar}}Hi there!{{/foo-bar}}`;

      let ast = parse(template);
      ast.body[0].hash = builders.hash([builders.pair('hello', builders.string('world'))]);

      assert.equal(print(ast), '{{#foo-bar hello="world"}}Hi there!{{/foo-bar}}');
    });

    QUnit.test('adding multiple HashPair to previously empty hash', function (assert) {
      let template = '{{#foo-bar}}Hi there!{{/foo-bar}}{{baz}}';

      let ast = parse(template);
      ast.body[0].hash.pairs.push(builders.pair('hello', builders.string('world')));
      ast.body[0].hash.pairs.push(builders.pair('foo', builders.string('bar')));

      assert.equal(print(ast), '{{#foo-bar hello="world" foo="bar"}}Hi there!{{/foo-bar}}{{baz}}');
    });

    QUnit.test('replacing empty hash w/ block params works', function (assert) {
      let template = `{{#foo-bar as |a b c|}}Hi there!{{/foo-bar}}`;

      let ast = parse(template);
      ast.body[0].hash = builders.hash([builders.pair('hello', builders.string('world'))]);

      assert.equal(print(ast), '{{#foo-bar hello="world" as |a b c|}}Hi there!{{/foo-bar}}');
    });

    QUnit.test('adding new HashPair to an empty hash w/ block params works', function (assert) {
      let template = `{{#foo-bar as |a b c|}}Hi there!{{/foo-bar}}`;

      let ast = parse(template);
      ast.body[0].hash.pairs.push(builders.pair('hello', builders.string('world')));

      assert.equal(print(ast), '{{#foo-bar hello="world" as |a b c|}}Hi there!{{/foo-bar}}');
    });

    QUnit.test('changing a HashPair key with a StringLiteral value (GH#112)', function (assert) {
      let template = `{{#foo-bar foo="some thing with a space"}}Hi there!{{/foo-bar}}`;

      let ast = parse(template);
      ast.body[0].hash.pairs[0].key = 'bar';

      assert.equal(print(ast), '{{#foo-bar bar="some thing with a space"}}Hi there!{{/foo-bar}}');
    });

    QUnit.test('changing a HashPair key with a SubExpression value (GH#112)', function (assert) {
      let template = `{{#foo-bar foo=(helper-here this.arg1 this.arg2)}}Hi there!{{/foo-bar}}`;

      let ast = parse(template);
      ast.body[0].hash.pairs[0].key = 'bar';

      assert.equal(
        print(ast),
        '{{#foo-bar bar=(helper-here this.arg1 this.arg2)}}Hi there!{{/foo-bar}}'
      );
    });

    QUnit.test('changing a HashPair value from StringLiteral to SubExpression', function (assert) {
      let template = `{{#foo-bar foo="bar!"}}Hi there!{{/foo-bar}}`;

      let ast = parse(template);
      ast.body[0].hash.pairs[0].value = builders.sexpr('concat', [
        builders.string('hello'),
        builders.string('world'),
      ]);

      assert.equal(print(ast), '{{#foo-bar foo=(concat "hello" "world")}}Hi there!{{/foo-bar}}');
    });

    QUnit.test('changing a HashPair value from SubExpression to StringLiteral', function (assert) {
      let template = `{{#foo-bar foo=(concat "hello" "world")}}Hi there!{{/foo-bar}}`;

      let ast = parse(template);
      ast.body[0].hash.pairs[0].value = builders.string('hello world!');

      assert.equal(print(ast), '{{#foo-bar foo="hello world!"}}Hi there!{{/foo-bar}}');
    });

    QUnit.test('adding param with no params or hash', function (assert) {
      let template = `{{#foo-bar}}Hi there!{{/foo-bar}}`;

      let ast = parse(template);
      ast.body[0].params.push(builders.path('this.foo'));

      assert.equal(print(ast), '{{#foo-bar this.foo}}Hi there!{{/foo-bar}}');
    });

    QUnit.test('adding param with empty program', function (assert) {
      let template = `{{#foo-bar}}{{/foo-bar}}`;

      let ast = parse(template);
      ast.body[0].params.push(builders.path('this.foo'));

      assert.equal(print(ast), '{{#foo-bar this.foo}}{{/foo-bar}}');
    });

    QUnit.test('adding param with existing params', function (assert) {
      let template = `{{#foo-bar this.first}}Hi there!{{/foo-bar}}`;

      let ast = parse(template);
      ast.body[0].params.push(builders.path('this.foo'));

      assert.equal(print(ast), '{{#foo-bar this.first this.foo}}Hi there!{{/foo-bar}}');
    });

    QUnit.test(
      'adding param with existing params infers indentation from existing params',
      function (assert) {
        let template = `{{#foo-bar \n   \nthis.first}}Hi there!{{/foo-bar}}`;

        let ast = parse(template);
        ast.body[0].params.push(builders.path('this.foo'));

        assert.equal(
          print(ast),
          '{{#foo-bar \n   \nthis.first \n   \nthis.foo}}Hi there!{{/foo-bar}}'
        );
      }
    );

    QUnit.test('adding child to end of program', function (assert) {
      let template = `{{#foo-bar}}Hello{{/foo-bar}}`;

      let ast = parse(template);
      ast.body[0].program.body.push(builders.text(' world!'));

      assert.equal(print(ast), '{{#foo-bar}}Hello world!{{/foo-bar}}');
    });

    QUnit.test('adding child to beginning of program', function (assert) {
      let template = `{{#foo-bar}}Hello{{/foo-bar}}`;

      let ast = parse(template);
      ast.body[0].program.body.unshift(builders.text('ZOMG! '));

      assert.equal(print(ast), '{{#foo-bar}}ZOMG! Hello{{/foo-bar}}');
    });

    QUnit.test('adding child to end of inverse', function (assert) {
      let template = `{{#foo-bar}}{{else}}Hello{{/foo-bar}}`;

      let ast = parse(template);
      ast.body[0].inverse.body.push(builders.text(' world!'));

      assert.equal(print(ast), '{{#foo-bar}}{{else}}Hello world!{{/foo-bar}}');
    });

    QUnit.test('adding child to beginning of inverse', function (assert) {
      let template = `{{#foo-bar}}{{else}}Hello{{/foo-bar}}`;

      let ast = parse(template);
      ast.body[0].inverse.body.unshift(builders.text('ZOMG! '));

      assert.equal(print(ast), '{{#foo-bar}}{{else}}ZOMG! Hello{{/foo-bar}}');
    });

    QUnit.test(
      'adding child to end of inverse preserves whitespace and whitespace control when program is also present',
      function (assert) {
        let template = `{{#foo-bar}}Goodbye\n  {{~ else ~}} Hello{{/foo-bar}}`;

        let ast = parse(template);
        ast.body[0].inverse.body.push(builders.text(' world!'));

        assert.equal(print(ast), '{{#foo-bar}}Goodbye\n  {{~ else ~}} Hello world!{{/foo-bar}}');
      }
    );

    QUnit.test(
      'adding child to end of inverse preserves whitespace and whitespace control',
      function (assert) {
        let template = `{{#foo-bar}}{{~ else ~}}Hello{{/foo-bar}}`;

        let ast = parse(template);
        ast.body[0].inverse.body.push(builders.text(' world!'));

        assert.equal(print(ast), '{{#foo-bar}}{{~ else ~}}Hello world!{{/foo-bar}}');
      }
    );

    QUnit.test('add child in an {{else if foo}} chain', function (assert) {
      let template = `{{#if foo}}{{else if baz}}Hello{{/if}}`;

      let ast = parse(template);
      ast.body[0].inverse.body[0].program.body.push(builders.text(' world!'));

      assert.equal(print(ast), '{{#if foo}}{{else if baz}}Hello world!{{/if}}');
    });

    QUnit.test('adding an inverse', function (assert) {
      let template = `{{#foo-bar}}{{/foo-bar}}`;

      let ast = parse(template);
      ast.body[0].inverse = builders.blockItself([builders.text('ZOMG!')]);

      assert.equal(print(ast), '{{#foo-bar}}{{else}}ZOMG!{{/foo-bar}}');
    });

    QUnit.test('removing an inverse', function (assert) {
      let template = `{{#foo-bar}}Goodbye{{else}}Hello{{/foo-bar}}`;

      let ast = parse(template);
      ast.body[0].inverse = null;

      assert.equal(print(ast), '{{#foo-bar}}Goodbye{{/foo-bar}}');
    });

    QUnit.test('annotating an "else if" node', function (assert) {
      let template = '{{#if foo}}{{else if bar}}{{else}}{{/if}}';

      let ast = parse(template);
      ast.body[0].inverse.body[0]._isElseIfBlock = true;

      assert.equal(print(ast), '{{#if foo}}{{else if bar}}{{else}}{{/if}}');
    });

    QUnit.test('add block param (when none existed)', function (assert) {
      let template = `{{#foo-bar}}{{/foo-bar}}`;

      let ast = parse(template);
      ast.body[0].program.blockParams.push('foo');

      assert.equal(print(ast), '{{#foo-bar as |foo|}}{{/foo-bar}}');
    });

    QUnit.test('remove only block param', function (assert) {
      let template = `{{#foo-bar as |a|}}{{/foo-bar}}`;

      let ast = parse(template);
      ast.body[0].program.blockParams.pop();

      assert.equal(print(ast), '{{#foo-bar}}{{/foo-bar}}');
    });

    QUnit.test('remove one block param of many', function (assert) {
      let template = `{{#foo-bar as |a b|}}{{/foo-bar}}`;

      let ast = parse(template);
      ast.body[0].program.blockParams.pop();

      assert.equal(print(ast), '{{#foo-bar as |a|}}{{/foo-bar}}');
    });

    QUnit.test('remove one block param of many preserves custom whitespace', function (assert) {
      let template = stripIndent`
        {{#foo-bar
          as |a b|
        }}
        {{/foo-bar}}
      `;

      let ast = parse(template);
      ast.body[0].program.blockParams.pop();

      assert.equal(
        print(ast),
        stripIndent`
        {{#foo-bar
          as |a|
        }}
        {{/foo-bar}}
        `
      );
    });

    QUnit.test('remove only block param preserves custom whitespace', function (assert) {
      let template = stripIndent`
        {{#foo-bar
          some=thing
          as |a|
        }}
        {{/foo-bar}}
      `;

      let ast = parse(template);
      ast.body[0].program.blockParams.pop();

      assert.equal(
        print(ast),
        stripIndent`
        {{#foo-bar
          some=thing
        }}
        {{/foo-bar}}
        `
      );
    });
  });

  QUnit.module('AttrNode', function () {
    QUnit.test('updating value', function (assert) {
      let template = '<Foo bar={{foo}} />';

      let ast = parse(template);
      ast.body[0].attributes[0].value.path.original = 'bar';

      assert.equal(print(ast), '<Foo bar={{bar}} />');
    });

    QUnit.test('updating concat statement value', function (assert) {
      let template = '<Foo class="{{foo}} static {{bar}}" />';

      let ast = parse(template);
      ast.body[0].attributes[0].value.parts.push(builders.text(' other-static'));

      assert.equal(print(ast), '<Foo class="{{foo}} static {{bar}} other-static" />');
    });

    QUnit.test('updating value from non-quotable to TextNode (GH#111)', function (assert) {
      let template = '<Foo bar={{foo}} />';

      let ast = parse(template);
      ast.body[0].attributes[0].value = builders.text('hello!');

      assert.equal(print(ast), '<Foo bar="hello!" />');
    });

    QUnit.test('updating value from non-quotable to ConcatStatement (GH#111)', function (assert) {
      let template = '<Foo bar={{foo}} />';

      let ast = parse(template);
      ast.body[0].attributes[0].value = builders.concat([
        builders.mustache('foo'),
        builders.text(' static '),
        builders.mustache('bar'),
      ]);

      assert.equal(print(ast), '<Foo bar="{{foo}} static {{bar}}" />');
    });

    QUnit.test(
      'can determine if an AttrNode was valueless (required by ember-template-lint)',
      function (assert) {
        assert.strictEqual(
          parse(`<Foo bar={{foo}} />`).body[0].attributes[0].isValueless,
          false,
          'MustacheStatement attribute value'
        );
        assert.strictEqual(
          parse(`<Foo bar="foo {{bar}}" />`).body[0].attributes[0].isValueless,
          false,
          'ConcatStatement attribute value'
        );
        assert.strictEqual(
          parse(`<Foo bar='foo {{bar}}' />`).body[0].attributes[0].isValueless,
          false,
          'ConcatStatement attribute value'
        );
        assert.strictEqual(
          parse(`<Foo bar="foo" />`).body[0].attributes[0].isValueless,
          false,
          'TextNode attribute value'
        );
        assert.strictEqual(
          parse(`<Foo bar='foo' />`).body[0].attributes[0].isValueless,
          false,
          'TextNode attribute value'
        );
        assert.strictEqual(
          parse(`<Foo bar=foo />`).body[0].attributes[0].isValueless,
          false,
          'TextNode attribute value'
        );
        assert.strictEqual(
          parse(`<Foo bar />`).body[0].attributes[0].isValueless,
          true,
          'valueless attribute'
        );
      }
    );

    QUnit.test(
      'can determine type of quotes used from AST (required by ember-template-lint)',
      function (assert) {
        assert.strictEqual(
          parse(`<Foo bar={{foo}} />`).body[0].attributes[0].quoteType,
          null,
          'mustache attribute values are `null`'
        );
        assert.strictEqual(
          parse(`<Foo bar="foo {{bar}}" />`).body[0].attributes[0].quoteType,
          `"`,
          'ConcatStatement attribute values show double quotes'
        );
        assert.strictEqual(
          parse(`<Foo bar='foo {{bar}}' />`).body[0].attributes[0].quoteType,
          `'`,
          'ConcatStatement attribute values show single quotes'
        );
        assert.strictEqual(
          parse(`<Foo bar="foo" />`).body[0].attributes[0].quoteType,
          `"`,
          'TextNode attribute values show double quotes'
        );
        assert.strictEqual(
          parse(`<Foo bar='foo' />`).body[0].attributes[0].quoteType,
          `'`,
          'TextNode attribute values show single quotes'
        );
        assert.strictEqual(
          parse(`<Foo bar=foo />`).body[0].attributes[0].quoteType,
          null,
          'TextNode attribute values for quoteless'
        );
        assert.strictEqual(
          parse(`<Foo bar />`).body[0].attributes[0].quoteType,
          null,
          'valueless attribute'
        );
      }
    );

    QUnit.test('renaming valueless attribute', function (assert) {
      let template = '<Foo data-bar />';

      let ast = parse(template);
      ast.body[0].attributes[0].name = 'data-foo';

      assert.equal(print(ast), '<Foo data-foo />');
    });

    QUnit.test('mutations retain custom whitespace formatting', function (assert) {
      let template = stripIndent`
        <Foo 
          bar = {{ foo }} />
      `;

      let ast = parse(template);
      ast.body[0].attributes[0].value.path.original = 'bar';

      assert.equal(print(ast), '<Foo \n  bar = {{ bar }} />');
    });

    QUnit.test('quotes are preserved when updated a TextNode value (double quote)', function (
      assert
    ) {
      let template = `<div class="lol"></div>`;

      let ast = parse(template);
      ast.body[0].attributes[0].value.chars = 'hahah';

      assert.equal(print(ast), '<div class="hahah"></div>');
    });

    QUnit.test('quotes are preserved when updated a TextNode value (single quote)', function (
      assert
    ) {
      let template = `<div class='lol'></div>`;

      let ast = parse(template);
      ast.body[0].attributes[0].value.chars = 'hahah';

      assert.equal(print(ast), `<div class='hahah'></div>`);
    });

    QUnit.test('can update a quoteless attribute value', function (assert) {
      let template = `<div class=wat></div>`;

      let ast = parse(template);
      ast.body[0].attributes[0].value.chars = 'zomgyasss';

      assert.equal(print(ast), '<div class=zomgyasss></div>');
    });

    QUnit.test('quotes are preserved when updating a ConcatStatement value', function (assert) {
      let template = `<div class="lol {{foo}}"></div>`;

      let ast = parse(template);
      ast.body[0].attributes[0].value.parts[0].chars = 'hahah ';

      assert.equal(print(ast), '<div class="hahah {{foo}}"></div>');
    });
  });

  QUnit.module('HashPair', function () {
    QUnit.test('mutations', function (assert) {
      let template = '{{foo-bar bar=foo}}';

      let ast = parse(template);
      ast.body[0].hash.pairs[0].value.original = 'bar';

      assert.equal(print(ast), '{{foo-bar bar=bar}}');
    });

    QUnit.test('mutations retain formatting', function (assert) {
      let template = '{{foo-bar   bar= foo}}';

      let ast = parse(template);
      ast.body[0].hash.pairs[0].value.original = 'bar';

      assert.equal(print(ast), '{{foo-bar   bar= bar}}');
    });
  });

  QUnit.test('can remove during traversal by returning `null`', function (assert) {
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

  QUnit.test('can replace with many items during traversal by returning an array', function (
    assert
  ) {
    let template = stripIndent`
    <p>here is some multiline string</p>
    {{other-stuff}}
    `;
    let { code } = transform(template, (env) => {
      let { builders: b } = env.syntax;

      return {
        ElementNode() {
          return [b.text('hello '), b.text('world')];
        },
      };
    });

    assert.equal(code, 'hello world\n{{other-stuff}}');
  });

  QUnit.module('MustacheCommentStatement', function () {
    QUnit.test('can be updated', function (assert) {
      let template = `<div {{!-- something here --}}></div>`;

      let ast = parse(template);
      ast.body[0].comments[0].value = ' otherthing ';

      assert.equal(print(ast), `<div {{!-- otherthing --}}></div>`);
    });

    QUnit.test('comments without `--` are preserved', function (assert) {
      let template = `<div {{! something here }}></div>`;

      let ast = parse(template);
      ast.body[0].comments[0].value = ' otherthing ';

      assert.equal(print(ast), `<div {{! otherthing }}></div>`);
    });
  });

  QUnit.module('ElementModifierStatement', function () {
    QUnit.test('can be updated', function (assert) {
      let template = `<div {{thing 'foo'}}></div>`;

      let ast = parse(template);
      ast.body[0].modifiers[0].path.original = 'other';

      assert.equal(print(ast), `<div {{other 'foo'}}></div>`);
    });
  });

  QUnit.module('CommentStatement', function () {
    QUnit.test('can be updated', function (assert) {
      let template = `<!-- something -->`;

      let ast = parse(template);
      ast.body[0].value = ' otherthing ';

      assert.equal(print(ast), `<!-- otherthing -->`);
    });
  });

  QUnit.module('ConcatStatement', function () {
    QUnit.test('can add parts', function (assert) {
      let template = `<div class="foo {{bar}}"></div>`;

      let ast = parse(template);
      ast.body[0].attributes[0].value.parts.push(builders.text(' baz'));

      assert.equal(print(ast), `<div class="foo {{bar}} baz"></div>`);
    });

    QUnit.test('preserves quote style', function (assert) {
      let template = `<div class='foo {{bar}}'></div>`;

      let ast = parse(template);
      ast.body[0].attributes[0].value.parts.push(builders.text(' baz'));

      assert.equal(print(ast), `<div class='foo {{bar}} baz'></div>`);
    });

    QUnit.test('updating parts preserves custom whitespace', function (assert) {
      let template = `<div class="foo {{\nbar\n}}"></div>`;

      let ast = parse(template);
      ast.body[0].attributes[0].value.parts.push(builders.text(' baz'));

      assert.equal(print(ast), `<div class="foo {{\nbar\n}} baz"></div>`);
    });
  });

  QUnit.module('StringLiteral', function () {
    QUnit.test('can be updated', function (assert) {
      let template = `{{foo "blah"}}`;

      let ast = parse(template);
      ast.body[0].params[0].value = 'derp';

      assert.equal(print(ast), `{{foo "derp"}}`);
    });
  });

  QUnit.module('NumberLiteral', function () {
    QUnit.test('can be updated', function (assert) {
      let template = `{{foo 42}}`;

      let ast = parse(template);
      ast.body[0].params[0].value = 0;

      assert.equal(print(ast), `{{foo 0}}`);
    });
  });

  QUnit.module('BooleanLiteral', function () {
    QUnit.test('can be updated in MustacheStatement .path position', function (assert) {
      let template = `{{true}}`;

      let ast = parse(template);
      ast.body[0].path.value = false;

      assert.equal(print(ast), `{{false}}`);
    });

    QUnit.test('can be updated in MustacheStatement .hash position', function (assert) {
      let template = `{{foo thing=true}}`;

      let ast = parse(template);
      ast.body[0].hash.pairs[0].value.value = false;

      assert.equal(print(ast), `{{foo thing=false}}`);
    });
  });

  QUnit.module('TextNode', function () {
    QUnit.test('can be updated', function (assert) {
      let template = `Foo`;

      let ast = parse(template);
      ast.body[0].chars = 'Bar';

      assert.equal(print(ast), 'Bar');
    });

    QUnit.test('can be updated as value of AttrNode', function (assert) {
      let template = `<div class="lol"></div>`;

      let ast = parse(template);
      ast.body[0].attributes[0].value.chars = 'hahah';

      assert.equal(print(ast), '<div class="hahah"></div>');
    });

    QUnit.test(
      'an AttrNode values quotes are removed when inserted in alternate positions (e.g. content)',
      function (assert) {
        let template = `<div class="lol"></div>`;

        let ast = parse(template);
        let text = ast.body[0].attributes[0].value;
        ast.body[0].children.push(text);

        assert.equal(print(ast), '<div class="lol">lol</div>');
      }
    );
  });
});
