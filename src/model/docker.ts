import core from '@actions/core';
import { ExecOptions, exec } from '@actions/exec';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Severity, UnityError, UnityErrorParser } from './error/unity-error-parser';
import GitHub from './github';
import ImageEnvironmentFactory from './image-environment-factory';
import { DockerParameters, StringKeyValuePair } from './shared-types';

class Docker {
  static async run(
    image: string,
    parameters: DockerParameters,
    silent: boolean = false,
    overrideCommands: string = '',
    additionalVariables: StringKeyValuePair[] = [],
    options: ExecOptions = {},
    entrypointBash: boolean = false,
  ): Promise<number> {
    const buildLogPath = path.join(parameters.workspace, 'unity-build.log');

    let runCommand = '';
    switch (process.platform) {
      case 'linux':
        runCommand = this.getLinuxCommand(image, parameters, overrideCommands, additionalVariables, entrypointBash);
        break;
      case 'win32':
        runCommand = this.getWindowsCommand(image, parameters);
        break;
      default:
        throw new Error(`Operation system, ${process.platform}, is not supported yet.`);
    }

    runCommand = `${runCommand} | tee ${buildLogPath}`;

    options.silent = silent;
    options.ignoreReturnCode = true;

    const exitCode = await exec(runCommand, undefined, options);

    if (existsSync(buildLogPath)) {
      const logContent = readFileSync(buildLogPath, 'utf8');
      const errors = UnityErrorParser.parse(logContent, Severity.Error);
      await this.report(errors);
    }

    return exitCode;
  }

  static async report(errors: UnityError[]) {
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

  static getLinuxCommand(
    image: string,
    parameters: DockerParameters,
    overrideCommands: string = '',
    additionalVariables: StringKeyValuePair[] = [],
    entrypointBash: boolean = false,
  ): string {
    const {
      workspace,
      actionFolder,
      runnerTempPath,
      sshAgent,
      sshPublicKeysDirectoryPath,
      gitPrivateToken,
      dockerWorkspacePath,
      dockerCpuLimit,
      dockerMemoryLimit,
    } = parameters;

    const githubHome = path.join(runnerTempPath, '_github_home');
    if (!existsSync(githubHome)) mkdirSync(githubHome);
    const githubWorkflow = path.join(runnerTempPath, '_github_workflow');
    if (!existsSync(githubWorkflow)) mkdirSync(githubWorkflow);
    const commandPrefix = image === `alpine` ? `/bin/sh` : `/bin/bash`;

    return `docker run \
            --workdir ${dockerWorkspacePath} \
            --rm \
            ${ImageEnvironmentFactory.getEnvVarString(parameters, additionalVariables)} \
            --env GITHUB_WORKSPACE=${dockerWorkspacePath} \
            --env GIT_CONFIG_EXTENSIONS \
            ${gitPrivateToken ? `--env GIT_PRIVATE_TOKEN="${gitPrivateToken}"` : ''} \
            ${sshAgent ? '--env SSH_AUTH_SOCK=/ssh-agent' : ''} \
            --volume "${githubHome}":"/root:z" \
            --volume "${githubWorkflow}":"/github/workflow:z" \
            --volume "${workspace}":"${dockerWorkspacePath}:z" \
            --volume "${actionFolder}/default-build-script:/UnityBuilderAction:z" \
            --volume "${actionFolder}/platforms/ubuntu/steps:/steps:z" \
            --volume "${actionFolder}/platforms/ubuntu/entrypoint.sh:/entrypoint.sh:z" \
            --volume "${actionFolder}/unity-config:/usr/share/unity3d/config/:z" \
            --volume "${actionFolder}/BlankProject":"/BlankProject:z" \
            --cpus=${dockerCpuLimit} \
            --memory=${dockerMemoryLimit} \
            ${sshAgent ? `--volume ${sshAgent}:/ssh-agent` : ''} \
            ${
              sshAgent && !sshPublicKeysDirectoryPath
                ? '--volume /home/runner/.ssh/known_hosts:/root/.ssh/known_hosts:ro'
                : ''
            } \
            ${sshPublicKeysDirectoryPath ? `--volume ${sshPublicKeysDirectoryPath}:/root/.ssh:ro` : ''} \
            ${entrypointBash ? `--entrypoint ${commandPrefix}` : ``} \
            ${image} \
            ${entrypointBash ? `-c` : `${commandPrefix} -c`} \
            "${overrideCommands !== '' ? overrideCommands : `/entrypoint.sh`}"`;
  }

  static getWindowsCommand(image: string, parameters: DockerParameters): string {
    const {
      workspace,
      actionFolder,
      gitPrivateToken,
      dockerWorkspacePath,
      dockerCpuLimit,
      dockerMemoryLimit,
      dockerIsolationMode,
    } = parameters;

    return `docker run \
            --workdir c:${dockerWorkspacePath} \
            --rm \
            ${ImageEnvironmentFactory.getEnvVarString(parameters)} \
            --env GITHUB_WORKSPACE=c:${dockerWorkspacePath} \
            ${gitPrivateToken ? `--env GIT_PRIVATE_TOKEN="${gitPrivateToken}"` : ''} \
            --volume "${workspace}":"c:${dockerWorkspacePath}" \
            --volume "c:/regkeys":"c:/regkeys" \
            --volume "C:/Program Files/Microsoft Visual Studio":"C:/Program Files/Microsoft Visual Studio" \
            --volume "C:/Program Files (x86)/Microsoft Visual Studio":"C:/Program Files (x86)/Microsoft Visual Studio" \
            --volume "C:/Program Files (x86)/Windows Kits":"C:/Program Files (x86)/Windows Kits" \
            --volume "C:/ProgramData/Microsoft/VisualStudio":"C:/ProgramData/Microsoft/VisualStudio" \
            --volume "${actionFolder}/default-build-script":"c:/UnityBuilderAction" \
            --volume "${actionFolder}/platforms/windows":"c:/steps" \
            --volume "${actionFolder}/unity-config":"C:/ProgramData/Unity/config" \
            --volume "${actionFolder}/BlankProject":"c:/BlankProject" \
            --cpus=${dockerCpuLimit} \
            --memory=${dockerMemoryLimit} \
            --isolation=${dockerIsolationMode} \
            ${image} \
            powershell c:/steps/entrypoint.ps1`;
  }
}

export default Docker;
