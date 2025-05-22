// Derived from https://github.com/game-ci/unity-builder/issues/677

export const Severity = {
  Error: 'error',
  Warning: 'warning',
};

export interface UnityError {
  type: string;
  message: string;
  lineNumber: number;
  context: string[];
  severity: string;
}

export class UnityErrorParser {
  private static readonly patterns = {
    [Severity.Error]: [{ pattern: /error CS\d+: (.*)/, category: 'Compilation Error' }],
    [Severity.Warning]: [{ pattern: /warning CS\d+: (.*)/, category: 'Compilation Warning' }],
  };

  public static parse(logContent: string, severity: string): UnityError[] {
    const lines = logContent.split('\n');

    return lines
      .map((line, index) => {
        for (const { pattern, category } of this.patterns[severity]) {
          const match = line.match(pattern);
          if (!match) return;

          return {
            type: category,
            message: match[1],
            lineNumber: index + 1,
            context: lines.slice(Math.max(0, index - 2), index + 2),
            severity,
          };
        }
      })
      .filter((x) => x)
      .map((x) => x as UnityError);
  }
}
