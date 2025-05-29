// Derived from https://github.com/game-ci/unity-builder/issues/677
import * as core from '@actions/core';
import GitHub from '../github';
import BuildParameters from '../build-parameters';

export const Severity = {
  Error: 'Error',
  Warning: 'Warning',
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
  public readonly reportErrors: boolean;
  public readonly reportWarnings: boolean;

  private readonly areAnyReportsEnabled: boolean; // True if either Error or Warning reporting is enabled
  private readonly patterns: PatternSet;

  constructor(parameters: BuildParameters) {
    this.reportErrors = parameters.reportErrors;
    this.reportWarnings = parameters.reportWarnings;
    this.areAnyReportsEnabled = this.reportErrors || this.reportWarnings;

    this.patterns = {
      [Severity.Error]: [
        ...parameters.errorPatterns,
        {
          pattern: /error CS\d+: (.*)/,
          category: 'C# Compilation Error',
        },
        {
          pattern: /error: cannot find symbol/,
          category: 'Java Compilation Error',
        },
        {
          pattern: /Segmentation fault: \(\d+\)/,
          category: 'C++ Error',
        },
        {
          pattern: /] error: \/Users|error: cannot find symbol|general error \(\d+\)|Exception: /,
          category: 'General Error',
        },
        {
          pattern:
            /Failed to process scene|Problem detected while opening|Prefab instance problem:|FileNotFoundException/,
          category: 'Unity Error',
        },
        {
          pattern:
            /> Execution failed|Execution failed for task|Error: Error uploading|error: Provisioning profile|Error: Failed to create release upload|Error: Could not find group Everyone|Error: Asset validation failed/,
          category: 'Execution Failure',
        },
        {
          pattern: /Upload failed:/,
          category: 'Upload Failure',
        },
        {
          pattern: /The caller does not have permission|No GoogleService-Info.plist/,
          category: 'API Error',
        },
      ],
      [Severity.Warning]: [
        ...parameters.warningPatterns,
        { pattern: /warning CS\d+: (.*)/, category: 'C# Compilation Warning' },
      ],
    };
  }

  public parse(logContent: string, severity: string): UnityError[] {
    if (!this.areAnyReportsEnabled) return [];

    const lines = logContent.split('\n');
    const errors: UnityError[] = [];

    for (const [index, line] of lines.entries()) {
      for (const { pattern, category } of this.patterns[severity]) {
        const match = line.match(pattern);
        if (!match) continue;

        errors.push({
          type: category,
          message: match[0],
          lineNumber: index + 1,
          context: lines.slice(Math.max(0, index - 2), index + 3),
          severity,
        });
      }
    }

    const logMethod = errors.length > 0 ? core.error : core.info;
    logMethod(`Found ${errors.length} ${severity.toLowerCase()}s`);

    return errors;
  }

  public async report(errors: UnityError[], severity: string, sha: string) {
    if (!this.areAnyReportsEnabled) return;

    const summary = this.createSummaryLines(errors, severity).join('');

    /* Only report errors to the summary, not warnings */
    if (severity === Severity.Error) {
      await core.summary.addRaw(summary || '').write();
    }

    await GitHub.createGitHubCheckWithErrors(summary, errors, severity, sha);
  }

  private createSummaryLines(errors: UnityError[], severity: string): string[] {
    const summaryLines = [`## Unity Build ${severity} Summary\n\n`];

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
