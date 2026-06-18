/**
 * Split SQL into individual statements for execution via Prisma $executeRawUnsafe.
 *
 * Key behavior:
 * - Comment lines (-- ...) are STRIPPED entirely (not included in output)
 * - Multi-line comments (block comments) are stripped
 * - String literals with semicolons inside are preserved
 * - Each output statement is pure SQL, no leading comments
 */
export function splitSql(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let i = 0;

  while (i < sql.length) {
    const ch = sql[i];

    // -- single-line comment: skip entirely (don't add to current)
    if (ch === "-" && sql[i + 1] === "-") {
      const end = sql.indexOf("\n", i);
      if (end === -1) {
        i = sql.length;
      } else {
        i = end + 1;
      }
      continue;
    }

  // Block comment: skip entirely
  if (ch === "/" && sql[i + 1] === "*") {
    const end = sql.indexOf("*\/", i + 2);
    if (end === -1) {
      i = sql.length;
    } else {
      i = end + 2;
    }
    continue;
  }
    // Dollar-quoted string: $$...$$ or $tag$...$tag$
    if (ch === "$") {
      const tagStart = i + 1;
      const tagEnd = sql.indexOf("$", tagStart);
      if (tagEnd !== -1) {
        const tag = sql.substring(i, tagEnd + 1);
        const contentEnd = sql.indexOf(tag, tagEnd + 1);
        if (contentEnd !== -1) {
          current += sql.substring(i, contentEnd + tag.length);
          i = contentEnd + tag.length;
          continue;
        }
      }
      current += ch;
      i++;
      continue;
    }

    // Single-quoted string: '...'
    if (ch === "'") {
      current += ch;
      i++;
      while (i < sql.length) {
        if (sql[i] === "'") {
          current += sql[i];
          i++;
          if (i < sql.length && sql[i] === "'") {
            current += sql[i];
            i++;
            continue;
          }
          break;
        }
        current += sql[i];
        i++;
      }
      continue;
    }

    // Semicolon = end of statement
    if (ch === ";") {
      const stmt = current.trim();
      if (stmt.length > 0) {
        statements.push(stmt);
      }
      current = "";
      i++;
      continue;
    }

    // Whitespace / newlines: normalize to single space
    if (ch === "\n" || ch === "\r" || ch === "\t") {
      current += " ";
      i++;
      continue;
    }

    current += ch;
    i++;
  }

  // Last statement (no trailing semicolon)
  const last = current.trim();
  if (last.length > 0) {
    statements.push(last);
  }

  return statements;
}