/**
 * Pure, dependency-free arithmetic evaluator for the chat `calculator` tool.
 * Tokenize → shunting-yard to RPN → evaluate. No `eval`/`Function` (the input is
 * model/user-supplied). Supports + - * / %, ^ (right-assoc), unary minus,
 * parentheses, and decimals. Returns a discriminated result so the tool can
 * surface a clean error without throwing.
 */
export type CalcResult = { result: number } | { error: string };

type Tok =
  | { t: "num"; v: number }
  | { t: "op"; v: "+" | "-" | "*" | "/" | "%" | "^" | "u-" }
  | { t: "lp" }
  | { t: "rp" };

const PREC: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2, "%": 2, "u-": 3, "^": 4 };
const RIGHT = new Set(["^", "u-"]);

function tokenize(src: string): Tok[] | null {
  const toks: Tok[] = [];
  let i = 0;
  const prevIsValue = () => {
    const p = toks[toks.length - 1];
    return !!p && (p.t === "num" || p.t === "rp");
  };
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t") { i++; continue; }
    if ((c >= "0" && c <= "9") || c === ".") {
      let j = i + 1;
      while (j < src.length && ((src[j] >= "0" && src[j] <= "9") || src[j] === ".")) j++;
      const num = Number(src.slice(i, j));
      if (Number.isNaN(num)) return null;
      toks.push({ t: "num", v: num });
      i = j;
      continue;
    }
    if (c === "(") { toks.push({ t: "lp" }); i++; continue; }
    if (c === ")") { toks.push({ t: "rp" }); i++; continue; }
    if (c === "+" || c === "-" || c === "*" || c === "/" || c === "%" || c === "^") {
      if (c === "-" && !prevIsValue()) toks.push({ t: "op", v: "u-" });
      else toks.push({ t: "op", v: c });
      i++;
      continue;
    }
    return null; // unknown character
  }
  return toks;
}

function toRpn(toks: Tok[]): Tok[] | null {
  const out: Tok[] = [];
  const ops: Tok[] = [];
  for (const tok of toks) {
    if (tok.t === "num") out.push(tok);
    else if (tok.t === "op") {
      while (ops.length) {
        const top = ops[ops.length - 1];
        if (top.t !== "op") break;
        const higher = PREC[top.v] > PREC[tok.v];
        const equalLeft = PREC[top.v] === PREC[tok.v] && !RIGHT.has(tok.v);
        if (higher || equalLeft) out.push(ops.pop() as Tok);
        else break;
      }
      ops.push(tok);
    } else if (tok.t === "lp") ops.push(tok);
    else {
      let found = false;
      while (ops.length) {
        const top = ops.pop() as Tok;
        if (top.t === "lp") { found = true; break; }
        out.push(top);
      }
      if (!found) return null; // mismatched ')'
    }
  }
  while (ops.length) {
    const top = ops.pop() as Tok;
    if (top.t === "lp" || top.t === "rp") return null; // mismatched '('
    out.push(top);
  }
  return out;
}

function evalRpn(rpn: Tok[]): CalcResult {
  const st: number[] = [];
  for (const tok of rpn) {
    if (tok.t === "num") { st.push(tok.v); continue; }
    if (tok.t !== "op") return { error: "Invalid expression." };
    if (tok.v === "u-") {
      if (st.length < 1) return { error: "Invalid expression." };
      st.push(-(st.pop() as number));
      continue;
    }
    if (st.length < 2) return { error: "Invalid expression." };
    const b = st.pop() as number;
    const a = st.pop() as number;
    switch (tok.v) {
      case "+": st.push(a + b); break;
      case "-": st.push(a - b); break;
      case "*": st.push(a * b); break;
      case "/":
        if (b === 0) return { error: "Cannot divide by zero." };
        st.push(a / b);
        break;
      case "%":
        if (b === 0) return { error: "Cannot divide by zero." };
        st.push(a % b);
        break;
      case "^": st.push(Math.pow(a, b)); break;
    }
  }
  if (st.length !== 1) return { error: "Invalid expression." };
  const result = st[0];
  if (!Number.isFinite(result)) return { error: "Result is not a finite number." };
  return { result };
}

export function evaluateExpression(expr: string): CalcResult {
  if (typeof expr !== "string" || expr.trim() === "") return { error: "Empty expression." };
  const toks = tokenize(expr);
  if (!toks || toks.length === 0) return { error: "Could not read that expression." };
  const rpn = toRpn(toks);
  if (!rpn) return { error: "Mismatched parentheses or malformed expression." };
  return evalRpn(rpn);
}
