import * as core from '@actions/core';

class Output {
  static async setBuildVersion(buildVersion: string) {
    core.setOutput('buildVersion', buildVersion);
  }

  static async setAndroidVersionCode(androidVersionCode: string) {
    core.setOutput('androidVersionCode', androidVersionCode);
  }

  static async setEngineExitCode(exitCode: number) {
    core.setOutput('engineExitCode', exitCode);
  }

  static async setExitSummary(summary: string) {
    core.setOutput('exitSummary', summary);
  }
}

export default Output;
