const reLines = /(.*?(?:\r\n?|\n|$))/gm;

import type { AST } from '@glimmer/syntax';

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

export function isSynthetic(node: AST.Node): boolean {
  if (node && node.loc) {
    return node.loc.source === '(synthetic)';
  }

  return false;
}

export function sortByLoc(a: AST.Node, b: AST.Node): -1 | 0 | 1 {
  // be conservative about the location where a new node is inserted
  if (isSynthetic(a) || isSynthetic(b)) {
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
