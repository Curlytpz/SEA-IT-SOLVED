class RangeNotSatisfiableError extends Error {
  constructor(size) {
    super('The requested byte range is not satisfiable.');
    this.code = 'RANGE_NOT_SATISFIABLE';
    this.size = size;
  }
}

function invalid(size) {
  throw new RangeNotSatisfiableError(size);
}

function parseHttpByteRange(header, size) {
  if (!header) return null;
  if (!Number.isSafeInteger(size) || size < 0) invalid(size);
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim());
  if (!match || (!match[1] && !match[2]) || size === 0) invalid(size);

  let start;
  let end;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) invalid(size);
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start) invalid(size);
    end = Math.min(end, size - 1);
  }
  return { start, end, length: end - start + 1 };
}

module.exports = { parseHttpByteRange, RangeNotSatisfiableError };
