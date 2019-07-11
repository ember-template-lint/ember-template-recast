## v3.1.1 (2019-07-11)

#### :house: Internal
* [#75](https://github.com/ember-template-lint/ember-template-recast/pull/75) Remove duplicated @glimmer/syntax printer implementation. ([@rwjblue](https://github.com/rwjblue))

#### Committers: 1
- Robert Jackson ([@rwjblue](https://github.com/rwjblue))

## v3.1.0 (2019-07-11)

#### :rocket: Enhancement
* [#74](https://github.com/ember-template-lint/ember-template-recast/pull/74) Add recursive printing support ([@rwjblue](https://github.com/rwjblue))

#### :house: Internal
* [#73](https://github.com/ember-template-lint/ember-template-recast/pull/73) Split tests out into multiple files. ([@rwjblue](https://github.com/rwjblue))

#### Committers: 2
- Robert Jackson ([@rwjblue](https://github.com/rwjblue))
- [@dependabot-preview[bot]](https://github.com/apps/dependabot-preview)

## v3.0.0 (2019-07-09)

#### :boom: Breaking Change
* [#70](https://github.com/ember-template-lint/ember-template-recast/pull/70) Complete rewrite of mutation engine ([@rwjblue](https://github.com/rwjblue))

#### :rocket: Enhancement
* [#70](https://github.com/ember-template-lint/ember-template-recast/pull/70) Complete rewrite of mutation engine ([@rwjblue](https://github.com/rwjblue))

#### Committers: 1
- Robert Jackson ([@rwjblue](https://github.com/rwjblue))

## v2.0.2 (2019-07-05)

#### :bug: Bug Fix
* [#69](https://github.com/ember-template-lint/ember-template-recast/pull/69) Ensure returning an array from a visitor is handled properly ([@lifeart](https://github.com/lifeart))

#### Committers: 1
- Alex Kanunnikov ([@lifeart](https://github.com/lifeart))

## v2.0.1 (2019-07-05)

#### :bug: Bug Fix
* [#67](https://github.com/ember-template-lint/ember-template-recast/pull/67) Fix rewriting of whitespace controlled mustaches (bump @glimmer/syntax to 0.41.3) ([@dependabot-preview[bot]](https://github.com/apps/dependabot-preview))
* * [#66](https://github.com/ember-template-lint/ember-template-recast/pull/66) Ensure HTML Entities are not transformed during printing ([@rwjblue](https://github.com/rwjblue))
* * [#61](https://github.com/ember-template-lint/ember-template-recast/pull/61) Ensure `{{{` can be printed properly (bump @glimmer/syntax to 0.41.1) ([@dependabot-preview[bot]](https://github.com/apps/dependabot-preview))
* * [#63](https://github.com/ember-template-lint/ember-template-recast/pull/63) Ignore gitignored files when using globs ([@lennyburdette](https://github.com/lennyburdette))
*
* #### :house: Internal
* * [#65](https://github.com/ember-template-lint/ember-template-recast/pull/65) Add test case demonstrating how to update a path expression of a positional param ([@NullVoxPopuli](https://github.com/NullVoxPopuli))
*
* #### Committers: 4
* - L. Preston Sego III ([@NullVoxPopuli](https://github.com/NullVoxPopuli))
* - Lenny Burdette ([@lennyburdette](https://github.com/lennyburdette))
* - Robert Jackson ([@rwjblue](https://github.com/rwjblue))
* - [@dependabot-preview[bot]](https://github.com/apps/dependabot-preview)

## v2.0.0 (2019-06-21)

#### :boom: Breaking Change
* [#57](https://github.com/ember-template-lint/ember-template-recast/pull/57) Drop support for Node 11. ([@rwjblue](https://github.com/rwjblue))
* [#37](https://github.com/ember-template-lint/ember-template-recast/pull/37) Drop support for Node.js 6 and 9 ([@Turbo87](https://github.com/Turbo87))

#### :rocket: Enhancement
* [#30](https://github.com/ember-template-lint/ember-template-recast/pull/30) Bump @glimmer/syntax from 0.39.3 to 0.40.1 ([@dependabot-preview[bot]](https://github.com/apps/dependabot-preview))

#### :bug: Bug Fix
* [#56](https://github.com/ember-template-lint/ember-template-recast/pull/56) Ensure logging doesn't obscure actual errors ([@lennyburdette](https://github.com/lennyburdette))
* [#45](https://github.com/ember-template-lint/ember-template-recast/pull/45) Fix broken tag name mutation for self-closing elements ([@Turbo87](https://github.com/Turbo87))

#### :house: Internal
* [#31](https://github.com/ember-template-lint/ember-template-recast/pull/31) Cleanup CI config ([@Turbo87](https://github.com/Turbo87))

#### Committers: 4
- Lenny Burdette ([@lennyburdette](https://github.com/lennyburdette))
- Robert Jackson ([@rwjblue](https://github.com/rwjblue))
- Tobias Bieniek ([@Turbo87](https://github.com/Turbo87))
- [@dependabot-preview[bot]](https://github.com/apps/dependabot-preview)

# Change Log

## v1.2.5 (2019-04-30)

#### :bug: Bug Fix
* [#22](https://github.com/ember-template-lint/ember-template-recast/pull/22) Adding named arguments when none existed previously. ([@zimmi88](https://github.com/zimmi88))

#### Committers: 1
- Tim Lindvall ([zimmi88](https://github.com/zimmi88))

## v1.2.4 (2019-04-18)

#### :bug: Bug Fix
* [#19](https://github.com/ember-template-lint/ember-template-recast/pull/19) Fix to whitespace trimming logic. ([@zimmi88](https://github.com/zimmi88))

#### :memo: Documentation
* [#18](https://github.com/ember-template-lint/ember-template-recast/pull/18) Fixes README example for template transform. ([@scalvert](https://github.com/scalvert))

#### :house: Internal
* [#17](https://github.com/ember-template-lint/ember-template-recast/pull/17) [PACKAGE UPDATE] Bump @glimmer/syntax to 0.39.3. ([@rajasegar](https://github.com/rajasegar))

#### Committers: 3
- Rajasegar Chandran ([rajasegar](https://github.com/rajasegar))
- Steve Calvert ([scalvert](https://github.com/scalvert))
- Tim Lindvall ([zimmi88](https://github.com/zimmi88))


## v1.2.3 (2019-01-28)

#### :rocket: Enhancement
* [#15](https://github.com/ember-template-lint/ember-template-recast/pull/15) Bump @glimmer/syntax to 0.38.1. ([@zimmi88](https://github.com/zimmi88))

#### Committers: 1
- Tim Lindvall ([zimmi88](https://github.com/zimmi88))


## v1.2.2 (2019-01-11)

#### :bug: Bug Fix
* [#14](https://github.com/ember-template-lint/ember-template-recast/pull/14) Fix: Improve handling of removed hash pairs. ([@zimmi88](https://github.com/zimmi88))

#### Committers: 1
- Tim Lindvall ([zimmi88](https://github.com/zimmi88))


## v1.2.1 (2018-12-19)

#### :bug: Bug Fix
* [#12](https://github.com/ember-template-lint/ember-template-recast/pull/12) Fix: Closing tags on block statements. ([@zimmi88](https://github.com/zimmi88))

#### Committers: 1
- Tim Lindvall ([zimmi88](https://github.com/zimmi88))

## v1.2.0 (2018-06-26)

#### :rocket: Enhancement
* [#8](https://github.com/ember-template-lint/ember-template-recast/pull/8) Add a binary for running transforms across multiple files. ([@lennyburdette](https://github.com/lennyburdette))

#### :bug: Bug Fix
* [#9](https://github.com/ember-template-lint/ember-template-recast/pull/9) Ensure `parseInt` is called with the correct radix.. ([@rwjblue](https://github.com/rwjblue))

#### Committers: 2
- Lenny Burdette ([lennyburdette](https://github.com/lennyburdette))
- Robert Jackson ([rwjblue](https://github.com/rwjblue))

## v1.1.3 (2018-05-19)

#### :bug: Bug Fix
* [#6](https://github.com/ember-template-lint/ember-template-recast/pull/6) Allow for many returning an array of nodes during transform. ([@chadhietala](https://github.com/chadhietala))

#### Committers: 2
- Chad Hietala ([chadhietala](https://github.com/chadhietala))
- Robert Jackson ([rwjblue](https://github.com/rwjblue))

## v1.1.2 (2018-05-19)

#### :bug: Bug Fix
* [#4](https://github.com/ember-template-lint/ember-template-recast/pull/4) Update @glimmer/syntax. ([@rwjblue](https://github.com/rwjblue))

#### Committers: 1
- Robert Jackson ([rwjblue](https://github.com/rwjblue))

## v1.1.1 (2018-05-19)

#### :rocket: Enhancement
* [#2](https://github.com/ember-template-lint/ember-template-recast/pull/2) Multi-line replacement support. ([@chadhietala](https://github.com/chadhietala))

#### :bug: Bug Fix
* [#2](https://github.com/ember-template-lint/ember-template-recast/pull/2) Multi-line replacement support. ([@chadhietala](https://github.com/chadhietala))

#### Committers: 1
- Chad Hietala ([chadhietala](https://github.com/chadhietala))
- Robert Jackson ([rwjblue](https://github.com/rwjblue))

## v1.1.0 (2018-05-17)

#### :rocket: Enhancement
* [#1](https://github.com/ember-template-lint/ember-template-recast/pull/1) [FEATURE] Add transform API. ([@chadhietala](https://github.com/chadhietala))

#### Committers: 1
- Chad Hietala ([chadhietala](https://github.com/chadhietala))

