/* eslint-disable comma-dangle */
/* eslint-disable max-len, max-lines-per-function */
// eslint-disable-next-line strict
"use strict";

const path = require("path");
const { execSync } = require("child_process");
const BasePlugin = require("ember-cli-deploy-plugin");
const packageJson = require("./package.json");

// Dynamically resolve `sentry-cli` location
const sentryCliPackagePath = require.resolve("@sentry/cli/package.json");
const { dir: sentryCliDirectory } = path.parse(sentryCliPackagePath);
const sentryCliRelativeBinLocation =
  require(sentryCliPackagePath).bin["sentry-cli"];
const sentryCliAbsoluteBinLocation = path.join(
  sentryCliDirectory,
  sentryCliRelativeBinLocation
);

module.exports = {
  name: packageJson.name,

  createDeployPlugin(options) {
    const DeployPlugin = BasePlugin.extend({
      name: options.name,

      defaultConfig: {
        assetsDir(context) {
          return path.join(context.distDir, "assets");
        },

        revisionKey(context) {
          return context.revisionData && context.revisionData.revisionKey;
        },

        environment(context) {
          return context.deployTarget;
        },

        url: "",

        injectDebugIds: true,
      },

      requiredConfig: ["appName", "orgName", "authToken"],

      didBuild() {
        if (!this.readConfig("injectDebugIds")) {
          this.log("SENTRY: Debug ID injection disabled, skipping...");
          return;
        }

        const assetsDir = this.readConfig("assetsDir");

        this.log("SENTRY: Injecting Debug IDs...");
        this.sentryCliExec("sourcemaps", `inject "${assetsDir}"`);
        this.log("SENTRY: Debug IDs injected!");
      },

      didPrepare() {
        const releaseName = `${this.readConfig("appName")}@${this.readConfig(
          "revisionKey"
        )}`;
        const assetsDir = this.readConfig("assetsDir");

        this.log("SENTRY: Creating release...");
        this.sentryCliExec("releases", `new "${releaseName}"`);

        this.log("SENTRY: Assigning commits...");
        this.sentryCliExec(
          "releases",
          `set-commits "${releaseName}" --auto --ignore-missing`
        );

        this.log("SENTRY: Uploading source maps...");
        this.sentryCliExec(
          "sourcemaps",
          `upload --release "${releaseName}" ${assetsDir}`
        );

        this.log("SENTRY: Finalizing release...");
        this.sentryCliExec("releases", `finalize "${releaseName}"`);

        this.log("SENTRY: Release published!...");
      },

      didDeploy() {
        const appName = this.readConfig("appName");
        const releaseName = `${appName}@${this.readConfig("revisionKey")}`;
        const environment = this.readConfig("environment");

        this.log("SENTRY: Deploying release...");
        this.sentryCliExec(
          "deploys",
          `new --release "${releaseName}" -e ${environment}`
        );
        this.log("SENTRY: Deployed!");
      },

      didFail() {
        const appName = this.readConfig("appName");
        const releaseName = `${appName}@${this.readConfig("revisionKey")}`;

        this.log("SENTRY: Deleting release...");
        this.sentryCliExec("releases", `delete "${releaseName}"`);
        this.log("SENTRY: Release deleted!");
      },

      sentryCliExec(command, subCommand) {
        const authToken = this.readConfig("authToken");
        const orgName = this.readConfig("orgName");
        const appName = this.readConfig("appName");
        const url = this.readConfig("url");

        return this._exec(
          [
            sentryCliAbsoluteBinLocation,
            url ? `--url ${url}` : null,
            `--auth-token ${authToken}`,
            command,
            `--org ${orgName}`,
            `--project ${appName}`,
            subCommand,
          ]
            .filter(Boolean)
            .join(" ")
        );
      },

      _exec(command = "") {
        return execSync(command, { cwd: this.project.root });
      },
    });

    return new DeployPlugin();
  },
};
