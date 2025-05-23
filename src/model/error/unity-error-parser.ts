// Derived from https://github.com/game-ci/unity-builder/issues/677
import core from '@actions/core';
import { Cli } from '../cli/cli';
import GitHub from '../github';

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
  public static readonly doErrorReporting = process.env.DO_ERROR_REPORTING === 'true';
  public static readonly errorPatterns = JSON.parse(process.env.REPORTING_ERROR_PATTERNS || '[]');
  public static readonly warningPatterns = JSON.parse(process.env.REPORTING_WARNING_PATTERNS || '[]');

  private static readonly patterns = {
    [Severity.Error]: [{ pattern: /error CS\d+: (.*)/, category: 'Compilation Error' }].concat(
      UnityErrorParser.errorPatterns,
    ),
    [Severity.Warning]: [{ pattern: /warning CS\d+: (.*)/, category: 'Compilation Warning' }].concat(
      UnityErrorParser.warningPatterns,
    ),
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

  public static async report(errors: UnityError[]) {
    if (!Cli.options?.doErrorReporting) return;
    if (errors.length === 0) return;

    const byType = new Map<string, UnityError[]>();
    for (const error of errors) {
      if (!byType.has(error.type)) {
        byType.set(error.type, []);
      }
      byType.get(error.type)!.push(error);
    }

    const summaryLines = ['## Unity Build Error Summary\n\n'];
    for (const [type, typeErrors] of byType) {
      summaryLines.push(`### ${type} (${typeErrors.length}) occurrences ###`);
      for (const error of typeErrors) {
        summaryLines.push(`- **Line ${error.lineNumber}**: ${error.message}\n`, '  ```\n');
        for (const line of error.context) {
          summaryLines.push(`  ${line}\n`);
        }
        summaryLines.push('  ```\n\n');
      }
    }

    const summary = summaryLines.join('');
    await core.summary.addRaw(summary).write();
    await GitHub.createGithubErrorCheck(summary, errors);
  }
}
