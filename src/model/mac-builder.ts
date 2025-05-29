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
    const buildLogPath = this.makeBuidLogPath();
    core.info(`Using buildLogPath=${buildLogPath}`);
    const errorParser = new UnityErrorParser(buildParameters);

    const runCommand = `bash ${actionFolder}/platforms/mac/entrypoint.sh`;
    const exitCode = await exec(runCommand, [buildLogPath], { silent, ignoreReturnCode: true });

    if (!existsSync(buildLogPath)) {
      core.error(`Log at ${buildLogPath} does not exist!`);

      return exitCode;
    }

    const logContent = readFileSync(buildLogPath).toString();
    core.info(`Successfully read content from ${buildLogPath}: log length = {logContent.length}`);

    if (errorParser.reportErrors) {
      const errors = errorParser.parse(logContent, Severity.Error);
      await errorParser.report(errors, Severity.Error, buildParameters.gitSha);
    }

    if (errorParser.reportWarnings) {
      const warnings = errorParser.parse(logContent, Severity.Warning);
      await errorParser.report(warnings, Severity.Warning, buildParameters.gitSha);
    }

    /* cleanup the logfile we used for parsing */
    if (existsSync(buildLogPath)) {
      rmSync(buildLogPath);
    }

    return exitCode;
  }

  private static makeBuidLogPath() {
    const uid = UUIDv4().replace(/-/g, '');
    const projectPath = `${process.env.GITHUB_WORKSPACE}/${process.env.PROJECT_PATH}`;

    return `${projectPath}/unity-build.${uid}.log`;
  }
}

export default MacBuilder;
