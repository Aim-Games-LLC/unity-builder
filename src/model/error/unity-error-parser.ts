// Derived from https://github.com/game-ci/unity-builder/issues/677
import core from '@actions/core';
import GitHub from '../github';
import BuildParameters from '../build-parameters';

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

interface Pattern {
  pattern: string | RegExp;
  category: string;
}

interface PatternSet {
  [key: string]: Pattern[];
}

export class UnityErrorParser {
  public readonly doErrorReporting: boolean;
  private patterns: PatternSet;

  constructor(parameters: BuildParameters) {
    this.doErrorReporting = parameters.errorReporting;
    this.patterns = {
      [Severity.Error]: [...parameters.errorPatterns, { pattern: /error CS\d+: (.*)/, category: 'Compilation Error' }],
      [Severity.Warning]: [
        ...parameters.warningPatterns,
        { pattern: /warning CS\d+: (.*)/, category: 'Compilation Warning' },
      ],
    };
  }

  public parse(logContent: string, severity: string): UnityError[] {
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

  public async report(errors: UnityError[], severity: string) {
    if (!this.doErrorReporting) return;

    const summary = this.createSummaryLines(errors, severity).join('');
    await core.summary.addRaw(summary).write();
    await GitHub.createGithubErrorCheck(summary, errors, severity);
  }

  private createSummaryLines(errors: UnityError[], severity: string): string[] {
    const summaryLines = ['## Unity Build Error Summary\n\n'];

    if (errors.length === 0) {
      summaryLines.push(`No ${severity.toLowerCase()}s to report!`);

      return summaryLines;
    }

    const byType = new Map<string, UnityError[]>();
    for (const error of errors) {
      if (!byType.has(error.type)) {
        byType.set(error.type, []);
      }
      byType.get(error.type)!.push(error);
    }

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

    return summaryLines;
  }
}
