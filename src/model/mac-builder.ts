import * as core from '@actions/core';
import { exec } from '@actions/exec';
import { existsSync, readFileSync } from 'node:fs';
import { Severity, UnityErrorParser } from './error/unity-error-parser';
import Input from './input';

class MacBuilder {
  public static async run(actionFolder: string, silent: boolean = false): Promise<number> {
    // const projectPath = `${process.env.GITHUB_WORKSPACE}/${process.env.PROJECT_PATH}`;
    const buildLogPath = `${process.env.GITHUB_WORKSPACE}/unity-build.log`;
    const runCommand = `bash ${actionFolder}/platforms/mac/entrypoint.sh | tee ${buildLogPath}`;

    const exitCode = await exec(runCommand, [], { silent, ignoreReturnCode: true });

    if (Input.doErrorReporting && existsSync(buildLogPath)) {
      const logContent = readFileSync(buildLogPath, 'utf8');

      const errors = UnityErrorParser.parse(logContent, Severity.Error);
      const warnings = UnityErrorParser.parse(logContent, Severity.Warning);

      await UnityErrorParser.report(warnings, Severity.Warning);
      await UnityErrorParser.report(errors, Severity.Error);
    } else {
      if (Input.doErrorReporting) {
        core.info('Error reporting has been disabled.');
      } else {
        core.error(`Log at ${buildLogPath} does not exist!`);
      }
    }

    return exitCode;
  }
}

export default MacBuilder;
