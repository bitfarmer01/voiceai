/** Inline chip showing a calculator tool result: `expression = result`. */
export function CalculatorResult({
  expression,
  result,
  error,
}: {
  expression: string;
  result?: number;
  error?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 font-mono text-xs tabular-nums">
      <span className="text-muted-foreground">{expression}</span>
      {error ? (
        <span className="text-destructive">{error}</span>
      ) : (
        <span className="font-medium">= {result}</span>
      )}
    </span>
  );
}
