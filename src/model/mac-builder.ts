import * as core from '@actions/core';
import { exec } from '@actions/exec';
import { existsSync, readFileSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { Severity, UnityErrorParser } from './error/unity-error-parser';

class MacBuilder {
  public static async run(actionFolder: string, silent: boolean = false): Promise<number> {
    const buildLogPath = `${homedir()}/unity-build.log`;

    core.info(`buildLogPath = ${buildLogPath}`);

    if (existsSync(buildLogPath)) {
      core.info(`Build log at ${buildLogPath} already exists -- moving it to ${buildLogPath}.old`);
      renameSync(buildLogPath, `${buildLogPath}.old`); // renameSync will replace the existing file
    }

    core.info(`Touching ${buildLogPath} to ensure it exists`);
    await exec(`touch ${buildLogPath}`);
    if (existsSync(buildLogPath)) {
      core.info(`Confirmed that ${buildLogPath} exists!`);
    } else {
      core.warning(`!!!${buildLogPath} does not exist after touching!!!`);
    }

    const runCommand = `bash ${actionFolder}/platforms/mac/entrypoint.sh | tee ${buildLogPath}`;
    const exitCode = await exec(runCommand, [], { silent, ignoreReturnCode: true });

    if (existsSync(buildLogPath)) {
      core.info(`Build log at ${buildLogPath} still exists after build!`);
    } else {
      core.warning(`!!!Build log at ${buildLogPath} no longer exists after build!!!`);
    }

    if (UnityErrorParser.doErrorReporting && existsSync(buildLogPath)) {
      const logContent = readFileSync(buildLogPath, 'utf8');

      const errors = UnityErrorParser.parse(logContent, Severity.Error);
      const warnings = UnityErrorParser.parse(logContent, Severity.Warning);

      await UnityErrorParser.report(warnings, Severity.Warning);
      await UnityErrorParser.report(errors, Severity.Error);
    } else {
      if (UnityErrorParser.doErrorReporting) {
        core.info('Error reporting has been disabled.');
      } else {
        core.error(`Log at ${buildLogPath} does not exist!`);
      }
    }

    return exitCode;
  }
}

export default MacBuilder;
