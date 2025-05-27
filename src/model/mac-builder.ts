import * as core from '@actions/core';
import { exec } from '@actions/exec';
import { existsSync, readFileSync, renameSync, rmSync } from 'node:fs';

import BuildParameters from './build-parameters';
import { Severity, UnityErrorParser } from './error/unity-error-parser';

class MacBuilder {
  public static async run(
    buildParameters: BuildParameters,
    actionFolder: string,
    silent: boolean = false,
  ): Promise<number> {
    const buildLogPath = `${process.env.GITHUB_WORKSPACE}/${process.env.PROJECT_PATH}/BuildLogs/out.log`;
    const errorParser = new UnityErrorParser(buildParameters);

    if (existsSync(buildLogPath)) {
      core.info(`Build log at ${buildLogPath} already exists -- moving it to ${buildLogPath}.old`);
      renameSync(buildLogPath, `${buildLogPath}.old`); // renameSync will replace the existing file
    }

    const runCommand = `bash ${actionFolder}/platforms/mac/entrypoint.sh | tee ${buildLogPath}`;
    const exitCode = await exec(runCommand, [], { silent, ignoreReturnCode: true });

    if (existsSync(buildLogPath)) {
      core.info(`Build log at ${buildLogPath} still exists after build!`);

      const contents = readFileSync(buildLogPath, 'utf8');
      core.info(contents);
    } else {
      core.warning(`!!!Build log at ${buildLogPath} no longer exists after build!!!`);
    }

    core.info(`errorParser.doErrorReporting = ${errorParser.doErrorReporting}`);

    if (errorParser.doErrorReporting && existsSync(buildLogPath)) {
      const logContent = readFileSync(buildLogPath, 'utf8');

      const errors = errorParser.parse(logContent, Severity.Error);
      const warnings = errorParser.parse(logContent, Severity.Warning);

      await errorParser.report(warnings, Severity.Warning);
      await errorParser.report(errors, Severity.Error);
    } else {
      if (!errorParser.doErrorReporting) {
        core.info('Error reporting has been disabled.');
      } else {
        core.error(`Log at ${buildLogPath} does not exist!`);
      }
    }

    /* cleanup the logfile we tee'd */
    if (existsSync(buildLogPath)) {
      rmSync(buildLogPath);
    }

    return exitCode;
  }
}

export default MacBuilder;
