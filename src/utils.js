function isSynthetic(node) {
  if (node && node.loc) {
    return node.loc.source === '(synthetic)';
  }

  return false;
}

function sortByLoc(a, b) {
  // sort b higher than synthetic a
  if (isSynthetic(a)) {
    return 1;
  }

  // sort a higher than synthetic b
  if (isSynthetic(b)) {
    return -1;
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
  array.forEach(a => {
    if (typeof a !== 'undefined' && a !== null && a !== '') {
      newArray.push(a);
    }
  });
  return newArray;
}

function compactJoin(array, delimeter = '') {
  return compact(array).join(delimeter);
}

module.exports = {
  sortByLoc,
  compact,
  compactJoin,
};
