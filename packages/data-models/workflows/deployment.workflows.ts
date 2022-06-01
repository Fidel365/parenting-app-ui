import type { IDeploymentWorkflows } from "./workflow.model";
/** Default workflows made available to all deployments */
const workflows: IDeploymentWorkflows = {
  // Copy app-data assets directly to src assets
  // Note - this is already done as part of `tasks.appData.copy`, so just for postinstall
  deployment_create: {
    label: "Create a new local deployment",
    steps: [
      {
        name: "deployment_create",
        function: async ({ tasks }) => tasks.deployment.create(),
      },
    ],
  },
  deployment_import: {
    label: "Import a remote deployment repository",
    steps: [
      {
        name: "deployment_import",
        function: async ({ tasks }) => tasks.git().importRemoteRepo(),
      },
    ],
  },
  deployment_set: {
    label: "Set active deployment",
    steps: [
      {
        name: "deployment_set",
        function: async ({ tasks, config }) => {
          await tasks.deployment.set();
          if (config.git?.content_repo) {
            await tasks.git().refreshRemoteRepo();
          }
          tasks.appData.copyDeploymentDataToApp();
        },
      },
    ],
  },
};

export default workflows;
