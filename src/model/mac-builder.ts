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
      await UnityErrorParser.report(errors);
    }

    return exitCode;
  }
}

export default MacBuilder;
