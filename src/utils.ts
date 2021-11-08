const reLines = /(.*?(?:\r\n?|\n|$))/gm;

import type { ASTv1 as AST } from '@glimmer/syntax';

export function sourceForLoc(source: string | string[], loc?: AST.SourceLocation): string {
  if (!loc) {
    return '';
  }

  let sourceLines = Array.isArray(source) ? source : getLines(source);

  const firstLine = loc.start.line - 1;
  const lastLine = loc.end.line - 1;
  let currentLine = firstLine - 1;
  const firstColumn = loc.start.column;
  const lastColumn = loc.end.column;
  const string = [];
  let line;

  while (currentLine < lastLine) {
    currentLine++;
    // for templates that are completely empty the outer Template loc is line
    // 0, column 0 for both start and end defaulting to empty string prevents
    // more complicated logic below
    line = sourceLines[currentLine] || '';

    if (currentLine === firstLine) {
      if (firstLine === lastLine) {
        string.push(line.slice(firstColumn, lastColumn));
      } else {
        string.push(line.slice(firstColumn));
      }
    } else if (currentLine === lastLine) {
      string.push(line.slice(0, lastColumn));
    } else {
      string.push(line);
    }
  }

  return string.join('');
}

export function isSyntheticWithNoLocation(node: AST.Node): boolean {
  if (node && node.loc) {
    const { start, end } = node.loc;
    return (
      node.loc.module === '(synthetic)' && start.column === end.column && start.line === end.line
    );
  }

  return false;
}

export function sortByLoc(a: AST.Node, b: AST.Node): -1 | 0 | 1 {
  // be conservative about the location where a new node is inserted
  if (isSyntheticWithNoLocation(a) || isSyntheticWithNoLocation(b)) {
    return 0;
  }

  if (a.loc.start.line < b.loc.start.line) {
    return -1;
  }

  if (a.loc.start.line === b.loc.start.line && a.loc.start.column < b.loc.start.column) {
    return -1;
  }

  if (a.loc.start.line === b.loc.start.line && a.loc.start.column === b.loc.start.column) {
    return 0;
  }

  return 1;
}

export function compact(array: unknown[]): unknown[] {
  const newArray: unknown[] = [];
  array.forEach((a) => {
    if (typeof a !== 'undefined' && a !== null && a !== '') {
      newArray.push(a);
    }
  });
  return newArray;
}

export function compactJoin(array: unknown[], delimeter = ''): string {
  return compact(array).join(delimeter);
}

export function getLines(source: string): string[] {
  let result = source.match(reLines);

  if (!result) {
    throw new Error('could not parse source');
  }

  return result.slice(0, -1);
}

/*
 * This function takes a string (the source of an ElementNode or a
 * BlockStatement) and returns the first possible block param's range.
 *
 * If the block param is not found, the function will return [-1, -1];
 *
 * For example:
 * ```
 * rangeOfBlockParam("<Component as |bar|></Component>") // => [11, 18]
 * rangeOfBlockParam("{{#BlockStatement as |bar|}}{{/BlockStatement}}") // => [18, 25]
 * ```
 */
export function rangeOfFirstBlockParam(source: string): [number, number] {
  let start = source.search(/as\s+\|/);
  return [start, source.indexOf('|', start + 4)];
}

/*
 * This function takes a string (the source of an ElementNode or a
 * BlockStatement) and returns the range of the last possible block param's
 * range.
 *
 * If the block param is not found, the function will return [-1, -1];
 *
 * For example:
 * ```
 * rangeOfBlockParam('<Component data-foo="as |foo|" as |bar|></Component>') // => [31, 38]
 * rangeOfBlockParam('{{#BlockStatement data-foo="as |foo|" as |bar|}}{{/BlockStatement}}') // => [38, 45]
 * ```
 */
export function rangeOfBlockParam(source: string): [number, number] {
  let [start, end] = rangeOfFirstBlockParam(source);

  let range = [start, end];
  while (range[0] !== -1 && range[1] !== -1) {
    const tail = source.slice(end + 1);
    range = rangeOfFirstBlockParam(tail);

    if (range[0] !== -1 && range[1] !== -1) {
      start = end + 1 + range[0];
      end = end + 1 + range[1];
    }
  }

  return [start, end];
}

/*
 * This function takes a string (the source of an ElementNode or a
 * BlockStatement) and returns its block param.
 *
 * If the block param is not found, the function will return "";
 *
 * For example:
 * ```
 * getBlockParams("<Component as |bar|></Component>") // => "as |bar|"
 * getBlockParams("{{#BlockStatement as |bar|}}{{/BlockStatement}}") // => "as |bar|"
 * ```
 */
export function getBlockParams(source: string): string {
  const [indexOfAsPipe, indexOfEndPipe] = rangeOfBlockParam(source);
  return source.substring(indexOfAsPipe, indexOfEndPipe + 1);
}
