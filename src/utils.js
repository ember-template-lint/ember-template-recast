const reLines = /(.*?(?:\r\n?|\n|$))/gm;

function sourceForLoc(source, loc) {
  let sourceLines = Array.isArray(source) ? source : getLines(source);

  if (!loc) {
    return;
  }

  let firstLine = loc.start.line - 1;
  let lastLine = loc.end.line - 1;
  let currentLine = firstLine - 1;
  let firstColumn = loc.start.column;
  let lastColumn = loc.end.column;
  let string = [];
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

function isSynthetic(node) {
  if (node && node.loc) {
    return node.loc.source === '(synthetic)';
  }

  return false;
}

function sortByLoc(a, b) {
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

function compact(array) {
  const newArray = [];
  array.forEach((a) => {
    if (typeof a !== 'undefined' && a !== null && a !== '') {
      newArray.push(a);
    }
  });
  return newArray;
}

function compactJoin(array, delimeter = '') {
  return compact(array).join(delimeter);
}

function getLines(source) {
  let result = source.match(reLines);

  return result.slice(0, -1);
}

module.exports = {
  sortByLoc,
  compact,
  compactJoin,
  sourceForLoc,
  getLines,
};
