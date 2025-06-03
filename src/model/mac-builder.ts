import * as core from '@actions/core';
import { exec } from '@actions/exec';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { v4 as UUIDv4 } from 'uuid';
import BuildParameters from './build-parameters';
import { Severity, UnityErrorParser } from './error/unity-error-parser';

class MacBuilder {
  public static async run(
    buildParameters: BuildParameters,
    actionFolder: string,
    silent: boolean = false,
  ): Promise<number> {
    // The build log path is created from a random UUID to avoid collisions for parallel builds
    //  The entrypoint accepts a single flag which we're using to pass in the buildLogPath
    const buildLogPath = this.makeBuidLogPath(buildParameters.gitSha);

    // If the build log path came back empty, we've already properly logged out errors and are going to have to abort
    if (buildLogPath.length === 0) return 1;

    core.info(`Using buildLogPath=${buildLogPath}`);
    const logParser = new UnityErrorParser(buildParameters);

    const runCommand = `bash ${actionFolder}/platforms/mac/entrypoint.sh`;
    const exitCode = await exec(runCommand, [buildLogPath], { silent, ignoreReturnCode: true });

    if (!existsSync(buildLogPath)) {
      core.error(`Log at ${buildLogPath} does not exist!`);

      return exitCode;
    }

    const logContent = readFileSync(buildLogPath).toString();
    let parsedErrorCode = 0;

    if (logParser.reportErrors) {
      const errors = logParser.parse(logContent, Severity.Error);
      const success = await logParser.report(errors, Severity.Error, buildParameters.gitSha);
      if (!success) return 1; // Failed to create GitHub Check after several retries, time to bail
      parsedErrorCode = Math.min(errors.length, 1);
    }

    if (logParser.reportWarnings) {
      const warnings = logParser.parse(logContent, Severity.Warning);
      const success = await logParser.report(warnings, Severity.Warning, buildParameters.gitSha);
      if (!success) return 1; // Failed to create GitHub Check after several retries, time to bail
    }

    /* cleanup the logfile we used for parsing */
    if (existsSync(buildLogPath)) {
      rmSync(buildLogPath);
    }

    return exitCode || parsedErrorCode;
  }

  private static makeBuidLogPath(sha: string, retries: number = 0): string {
    if (retries >= 5) {
      core.error(`Failed to generate a valid, non-colliding build log path after ${retries - 1} attempts`);

      return '';
    }

    const projectPath = `${process.env.GITHUB_WORKSPACE}/${process.env.PROJECT_PATH}`;
    const uid = UUIDv4().replace(/-/g, '');
    const logPath = `${projectPath}/unity-build.${sha}.${uid}.log`;

    if (existsSync(logPath)) {
      core.info(`In an unlikely turn of events, ${logPath} already exists! Generating a new one`);

      return this.makeBuidLogPath(sha, retries + 1);
    }

    return logPath;
  }
}

export default MacBuilder;
