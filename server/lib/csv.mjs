// Minimal RFC 4180 CSV reader and writer (quotes, escaped quotes, CRLF, embedded newlines, BOM).

/** Returns [{ line, cells }] where line is the 1-based line number the record starts on. */
export function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const records = [];
  let cells = [];
  let cell = '';
  let inQuotes = false;
  let line = 1;
  let startLine = 1;
  let i = 0;
  const endCell = () => { cells.push(cell); cell = ''; };
  const endRecord = () => {
    endCell();
    if (!(cells.length === 1 && cells[0].trim() === '')) records.push({ line: startLine, cells });
    cells = [];
    startLine = line;
  };
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      if (ch === '\n') line++;
      cell += ch; i++; continue;
    }
    if (ch === '"' && cell === '') { inQuotes = true; i++; continue; }
    if (ch === ',') { endCell(); i++; continue; }
    if (ch === '\r') { i++; continue; }
    if (ch === '\n') { line++; endRecord(); i++; continue; }
    cell += ch; i++;
  }
  if (inQuotes) throw new Error('The file ends inside a quoted value (a " is missing).');
  if (cell !== '' || cells.length) endRecord();
  return records;
}

/** Stops spreadsheets from running text such as "=1+1" as a formula. */
const defuse = (s) => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);

export function csvCell(value, { text = false } = {}) {
  let s = value === null || value === undefined ? '' : String(value);
  if (text) s = defuse(s);
  return /[",\r\n]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows, textColumns = []) {
  return rows.map((r) => r.map((c, i) => csvCell(c, { text: textColumns.includes(i) })).join(',')).join('\r\n') + '\r\n';
}
