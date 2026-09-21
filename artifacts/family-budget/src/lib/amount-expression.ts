/**
 * Arithmetic in an amount field.
 *
 * A twin of the phone's lib/amountExpression.ts. Kept as a copy rather than a
 * shared package because adding one to this workspace means an install, and an
 * install here rewrites some 1600 lines of lockfile. A test asserts the two
 * files are identical below this notice, so a fix to one that misses the other
 * fails rather than drifting quietly.
 */
/** Characters a person might reach for, mapped to the ones the parser knows. */
const OPERATOR_ALIASES: Record<string, string> = {
  '×': '*',
  'x': '*',
  'X': '*',
  '÷': '/',
  '−': '-',
};

function normalize(input: string): string {
  let out = '';
  for (const char of input) {
    if (char === ' ' || char === ',') continue;
    out += OPERATOR_ALIASES[char] ?? char;
  }
  return out;
}

type Reader = { text: string; at: number };

function peek(reader: Reader): string | null {
  return reader.at < reader.text.length ? reader.text[reader.at] : null;
}

function readNumber(reader: Reader): number | null {
  const start = reader.at;
  while (reader.at < reader.text.length && /[0-9]/.test(reader.text[reader.at])) reader.at += 1;
  if (peek(reader) === '.') {
    reader.at += 1;
    while (reader.at < reader.text.length && /[0-9]/.test(reader.text[reader.at])) reader.at += 1;
  }
  if (reader.at === start) return null;
  const value = Number(reader.text.slice(start, reader.at));
  return Number.isFinite(value) ? value : null;
}

function readFactor(reader: Reader): number | null {
  if (peek(reader) === '(') {
    reader.at += 1;
    const inner = readExpression(reader);
    if (inner === null || peek(reader) !== ')') return null;
    reader.at += 1;
    return inner;
  }
  return readNumber(reader);
}

function readTerm(reader: Reader): number | null {
  let left = readFactor(reader);
  if (left === null) return null;
  for (;;) {
    const operator = peek(reader);
    if (operator !== '*' && operator !== '/') return left;
    reader.at += 1;
    const right = readFactor(reader);
    if (right === null) return null;
    // Dividing by zero gives Infinity, which would sail through a later
    // "greater than zero" check and be sent to the server as an amount.
    if (operator === '/' && right === 0) return null;
    left = operator === '*' ? left * right : left / right;
  }
}

function readExpression(reader: Reader): number | null {
  let left = readTerm(reader);
  if (left === null) return null;
  for (;;) {
    const operator = peek(reader);
    if (operator !== '+' && operator !== '-') return left;
    reader.at += 1;
    const right = readTerm(reader);
    if (right === null) return null;
    left = operator === '+' ? left + right : left - right;
  }
}

/**
 * The value of an arithmetic expression, or null if it is not one — including
 * while it is still half-typed, which is most of the time somebody is typing.
 *
 * Rounded to two decimal places, both because money has two and because
 * binary floating point makes 0.1 + 0.2 otherwise.
 */
export function evaluateAmountExpression(input: string): number | null {
  const text = normalize(input.trim());
  if (!text) return null;
  const reader: Reader = { text, at: 0 };
  const value = readExpression(reader);
  // Anything left over means the text was not wholly an expression: "12ab"
  // parses a 12 and then stops, and treating that as 12 would silently drop
  // what the person typed.
  if (value === null || reader.at !== text.length) return null;
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

/** Whether this text does arithmetic, rather than merely being a number. */
export function isAmountExpression(input: string): boolean {
  const text = normalize(input.trim());
  return /[+\-*/()]/.test(text) && evaluateAmountExpression(text) !== null;
}
