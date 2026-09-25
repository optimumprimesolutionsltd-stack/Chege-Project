def rw(p, pairs):
    s = open(p, encoding='utf8', newline='').read()
    crlf = '\r\n' in s
    t = s.replace('\r\n', '\n')
    for a, b in pairs:
        assert a in t, (p, a[:80])
        t = t.replace(a, b, 1)
    open(p, 'w', encoding='utf8', newline='').write(t.replace('\n', '\r\n') if crlf else t)


# ---- the parser: M-Pesa prints a masked number, 0722***443
rw('api-server/src/lib/mpesa-parser/normalize.ts', [
    ("""const PHONE_PATTERNS = [
  /\\+?254[\\s-]?(?:7\\d{2}|1\\d{2})[\\s-]?\\d{3}[\\s-]?\\d{3}/g,
  /\\b0(?:7\\d{2}|1\\d{2})[\\s-]?\\d{3}[\\s-]?\\d{3}\\b/g,
];""", """// M-Pesa often prints a number with its middle hidden (0722***443), and some
// copies turn the stars into other symbols. It is a phone number all the same,
// and left as it is the name before it cannot be read.
const MASK = "[*+xX\\\\u2022.]{2,5}";
const PHONE_PATTERNS = [
  /\\+?254[\\s-]?(?:7\\d{2}|1\\d{2})[\\s-]?\\d{3}[\\s-]?\\d{3}/g,
  /\\b0(?:7\\d{2}|1\\d{2})[\\s-]?\\d{3}[\\s-]?\\d{3}\\b/g,
  new RegExp(`\\\\+?254(?:7\\\\d{2}|1\\\\d{2})${MASK}\\\\d{3}\\\\b`, "g"),
  new RegExp(`\\\\b0(?:7\\\\d{2}|1\\\\d{2})${MASK}\\\\d{3}\\\\b`, "g"),
];"""),
])
print('ok')
