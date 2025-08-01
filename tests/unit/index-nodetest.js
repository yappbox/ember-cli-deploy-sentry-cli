/* eslint-disable space-before-function-paren */
/* eslint-disable comma-dangle */
/* eslint-disable max-lines-per-function */
const { assert } = require("chai");
const sinon = require("sinon");
const path = require("path");
const Plugin = require("../../index");

// Dynamically resolve `sentry-cli` location (same way as main plugin)
const sentryCliPackagePath = require.resolve("@sentry/cli/package.json");
const { dir: sentryCliDirectory } = path.parse(sentryCliPackagePath);
const sentryCliRelativeBinLocation =
  require(sentryCliPackagePath).bin["sentry-cli"];
const SENTRY_BIN_PATH = path.join(
  sentryCliDirectory,
  sentryCliRelativeBinLocation
);

function setupSinon() {
  before(function () {
    this.sinon = sinon.createSandbox();
  });

  afterEach(function () {
    this.sinon.restore();
  });
}

const stubProject = {
  name() {
    return "my-project";
  },
};

const mockUi = {
  verbose: true,
  messages: [],
  write() {},
  writeLine(message) {
    this.messages.push(message);
  },
};

describe("sentry-cli", function () {
  setupSinon();

  beforeEach(function () {
    this.context = {
      ui: mockUi,
      project: stubProject,
      distDir: "my-dest-dir",
      revisionData: {
        revisionKey: "v1.0.0@1234567",
      },
      deployTarget: "my-production",
      config: {
        "sentry-cli": {
          appName: "my-project",
          orgName: "my-org",
          authToken: "my-auth-token",
        },
      },
    };
  });

  it("has a name", function () {
    const plugin = Plugin.createDeployPlugin({ name: "sentry-cli" });

    assert.equal(plugin.name, "sentry-cli");
  });

  describe("implements correct hooks", function () {
    it("didPrepare", function () {
      const plugin = Plugin.createDeployPlugin({ name: "sentry-cli" });

      assert.equal(
        typeof plugin.didPrepare,
        "function",
        "Implements didPrepare"
      );
    });

    it("didDeploy", function () {
      const plugin = Plugin.createDeployPlugin({ name: "sentry-cli" });

      assert.equal(typeof plugin.didDeploy, "function", "Implements didDeploy");
    });

    it("didFail", function () {
      const plugin = Plugin.createDeployPlugin({ name: "sentry-cli" });

      assert.equal(typeof plugin.didFail, "function", "Implements didFail");
    });

    it("didBuild", function () {
      const plugin = Plugin.createDeployPlugin({ name: "sentry-cli" });

      assert.equal(typeof plugin.didBuild, "function", "Implements didBuild");
    });
  });

  describe("configure", function () {
    describe("requires config", function () {
      it("appName", function () {
        const plugin = Plugin.createDeployPlugin({ name: "sentry-cli" });

        this.context.config["sentry-cli"].appName = undefined;

        plugin.beforeHook(this.context);

        assert.throws(
          () => plugin.configure(this.context),
          "Missing required config: `appName`"
        );
      });

      it("orgName", function () {
        const plugin = Plugin.createDeployPlugin({ name: "sentry-cli" });

        this.context.config["sentry-cli"].orgName = undefined;

        plugin.beforeHook(this.context);

        assert.throws(
          () => plugin.configure(this.context),
          "Missing required config: `orgName`"
        );
      });

      it("authToken", function () {
        const plugin = Plugin.createDeployPlugin({ name: "sentry-cli" });

        this.context.config["sentry-cli"].authToken = undefined;

        plugin.beforeHook(this.context);

        assert.throws(
          () => plugin.configure(this.context),
          "Missing required config: `authToken`"
        );
      });
    });

    describe("has default config", function () {
      it("assetsDir", function () {
        const plugin = Plugin.createDeployPlugin({ name: "sentry-cli" });

        plugin.beforeHook(this.context);
        plugin.configure(this.context);

        assert.equal(
          plugin.readConfig("assetsDir"),
          path.join("my-dest-dir", "assets")
        );
      });

      it("revisionKey", function () {
        const plugin = Plugin.createDeployPlugin({ name: "sentry-cli" });

        plugin.beforeHook(this.context);
        plugin.configure(this.context);

        assert.equal(plugin.readConfig("revisionKey"), "v1.0.0@1234567");
      });

      it("environment", function () {
        const plugin = Plugin.createDeployPlugin({ name: "sentry-cli" });

        plugin.beforeHook(this.context);
        plugin.configure(this.context);

        assert.equal(plugin.readConfig("environment"), "my-production");
      });

      it("url", function () {
        const plugin = Plugin.createDeployPlugin({ name: "sentry-cli" });

        plugin.beforeHook(this.context);
        plugin.configure(this.context);

        assert.equal(plugin.readConfig("url"), "");
      });

      it("injectDebugIds", function () {
        const plugin = Plugin.createDeployPlugin({ name: "sentry-cli" });

        plugin.beforeHook(this.context);
        plugin.configure(this.context);

        assert.equal(plugin.readConfig("injectDebugIds"), true);
      });
    });
  });

  describe("didBuild", function () {
    it("injects debug IDs", function () {
      const plugin = Plugin.createDeployPlugin({ name: "sentry-cli" });
      const stub = this.sinon.stub(plugin, "_exec");

      plugin.beforeHook(this.context);
      plugin.configure(this.context);
      plugin.didBuild();

      this.sinon.assert.calledWithExactly(
        stub,
        `${SENTRY_BIN_PATH} --auth-token my-auth-token sourcemaps --org my-org --project my-project inject "${path.join(
          "my-dest-dir",
          "assets"
        )}"`
      );
    });

    it("skips debug ID injection when disabled", function () {
      const plugin = Plugin.createDeployPlugin({ name: "sentry-cli" });
      const stub = this.sinon.stub(plugin, "_exec");

      this.context.config["sentry-cli"].injectDebugIds = false;

      plugin.beforeHook(this.context);
      plugin.configure(this.context);
      plugin.didBuild();

      this.sinon.assert.notCalled(stub);
    });
  });

  describe("didPrepare", function () {
    it("creates release", function () {
      const plugin = Plugin.createDeployPlugin({ name: "sentry-cli" });
      const stub = this.sinon.stub(plugin, "_exec");

      plugin.beforeHook(this.context);
      plugin.configure(this.context);
      plugin.didPrepare();

      this.sinon.assert.calledWithExactly(
        stub,
        `${SENTRY_BIN_PATH} --auth-token my-auth-token releases --org my-org --project my-project new "my-project@v1.0.0@1234567"`
      );
    });

    it("sets related commits", function () {
      const plugin = Plugin.createDeployPlugin({ name: "sentry-cli" });
      const stub = this.sinon.stub(plugin, "_exec");

      plugin.beforeHook(this.context);
      plugin.configure(this.context);
      plugin.didPrepare();

      this.sinon.assert.calledWithExactly(
        stub,
        `${SENTRY_BIN_PATH} --auth-token my-auth-token releases --org my-org --project my-project set-commits "my-project@v1.0.0@1234567" --auto --ignore-missing`
      );
    });

    it("uploads source maps", function () {
      const plugin = Plugin.createDeployPlugin({ name: "sentry-cli" });
      const stub = this.sinon.stub(plugin, "_exec");

      plugin.beforeHook(this.context);
      plugin.configure(this.context);
      plugin.didPrepare();

      this.sinon.assert.calledWithExactly(
        stub,
        `${SENTRY_BIN_PATH} --auth-token my-auth-token sourcemaps --org my-org --project my-project upload --release "my-project@v1.0.0@1234567" ${path.join(
          "my-dest-dir",
          "assets"
        )}`
      );
    });

    it("saves release", function () {
      const plugin = Plugin.createDeployPlugin({ name: "sentry-cli" });
      const stub = this.sinon.stub(plugin, "_exec");

      plugin.beforeHook(this.context);
      plugin.configure(this.context);
      plugin.didPrepare();

      this.sinon.assert.calledWithExactly(
        stub,
        `${SENTRY_BIN_PATH} --auth-token my-auth-token releases --org my-org --project my-project finalize "my-project@v1.0.0@1234567"`
      );
    });
  });

  describe("didDeploy", function () {
    it("deploys release", function () {
      const plugin = Plugin.createDeployPlugin({ name: "sentry-cli" });
      const stub = this.sinon.stub(plugin, "_exec");

      plugin.beforeHook(this.context);
      plugin.configure(this.context);
      plugin.didDeploy();

      this.sinon.assert.calledWithExactly(
        stub,
        `${SENTRY_BIN_PATH} --auth-token my-auth-token deploys --org my-org --project my-project new --release "my-project@v1.0.0@1234567" -e my-production`
      );
    });
  });

  describe("didFail", function () {
    it("removes release", function () {
      const plugin = Plugin.createDeployPlugin({ name: "sentry-cli" });
      const stub = this.sinon.stub(plugin, "_exec");

      plugin.beforeHook(this.context);
      plugin.configure(this.context);
      plugin.didFail();

      this.sinon.assert.calledWithExactly(
        stub,
        `${SENTRY_BIN_PATH} --auth-token my-auth-token releases --org my-org --project my-project delete "my-project@v1.0.0@1234567"`
      );
    });
  });
});
