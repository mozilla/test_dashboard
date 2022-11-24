/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import axios from "axios";
import moment from "moment";

const functionalTestsWorkflowId = 5937682;

const _getSingleWorkflow = async (workflowId) => {
  const singleWorkflowRunApi = `https://api.github.com/repos/mozilla-mobile/mozilla-vpn-client/actions/workflows/${workflowId}/runs?branch=main`;
  let return_data = [];
  let i = 0;

  try {
    const {
      data: { workflow_runs },
    } = await axios.get(singleWorkflowRunApi);
    while (return_data.length < 20) {
      if (
        workflow_runs[i] &&
        workflow_runs[i].conclusion !== "cancelled" &&
        workflow_runs[i].status === "completed"
      ) {
        return_data.push(workflow_runs[i]);
      }

      ++i;
    }
  } catch (err) {
    console.log("Unable to fetch getSingleWorkflow", err);
    return;
  }

  return return_data;
};

const _getWorkflowCheckRuns = async (checkSuiteId) => {
  const workflowCheckRunsApi = `https://api.github.com/repos/mozilla-mobile/mozilla-vpn-client/check-suites/${checkSuiteId}/check-runs`;
  let return_data = [];

  try {
    const {
      data: { check_runs },
    } = await axios.get(workflowCheckRunsApi);
    for (let check_run of check_runs) {
      if (check_run.name !== "Build Test Client") {
        return_data.push(check_run);
      }
    }
  } catch (err) {
    console.log("Unable to fetch _getWorkflowCheckRuns", err);
    return;
  }

  return return_data;
};

const _getWorkflowCheckRunAnnotation = async (checkRunId) => {
  const workflowCheckRunAnnotationApi = `https://api.github.com/repos/mozilla-mobile/mozilla-vpn-client/check-runs/${checkRunId}/annotations`;
  let return_data = [];

  try {
    const { data } = await axios.get(workflowCheckRunAnnotationApi);
    for (let run_annotation of data) {
      return_data.push(run_annotation);
    }
  } catch (err) {
    console.log("Unable to fetch _getWorkflowCheckRunAnnotation", err);
    return;
  }

  return return_data;
};

/// full api
export const getFullTestWorkflowReport = async () => {
  let return_data = {
    fetched: moment().format().valueOf(),
    workflow_runs_data: [],
  };

  // if (await _getLocalData()) {
  //   const localData = await _getDataFromLocal();
  //   return_data.workflow_runs_data = localData.workflow_runs_data;
  //   return return_data;
  // }

  // if (await _checkForUpdate()) {
  //   const localData = await _getDataFromLocal();
  //   return_data.workflow_runs_data = localData.workflow_runs_data;
  //   return return_data;
  // }

  try {
    // get latest workflow runs for main branch
    const workflows = await _getSingleWorkflow(functionalTestsWorkflowId);

    // build object for workflow runs and check runs (functional test matrix run) for each workflow run
    for (let i = 0; i < workflows.length; i++) {
      let workflow = {
        workflow_run: {},
        test_runs: [],
        passed_count: 0,
        failed_count: 0,
        flaked_count: 0,
      };

      workflow.workflow_run = workflows[i];
      _delay(Math.floor(Math.random() * 1000) + 200);
      const checkRuns = await _getWorkflowCheckRuns(
        workflow.workflow_run.check_suite_id
      );

      for (let checkRun of checkRuns) {
        let test = {
          test_run: {},
          test_annotations: [],
          test_flake_history: [],
          test_flaked_count: 0,
          test_failed_count: 0,
          test_passed_count: 0,
        };

        test.test_run = checkRun;
        test.test_name = checkRun.name;
        test.test_started = checkRun.started_at;
        test.test_completed = checkRun.completed_at;
        if (test.test_run.output.annotations_count > 0) {
          let flake = {
            flakes: 0,
            failures: 0,
            messages: [],
            start_line: [],
            end_line: [],
          };

          let message = {};

          const delayTime = Math.floor(Math.random() * 1000) + 200;
          _delay(delayTime);
          const annotations = await _getWorkflowCheckRunAnnotation(
            test.test_run.id
          );
          test.test_annotations = annotations;
          flake.test_name = test.test_run.test_name;

          for (let annotation of annotations) {
            if (annotation.annotation_level === "warning") {
              workflow.flaked_count++;
              test.test_flaked_count++;
              flake.flakes++;
              message.info = annotation.message;
              message.start_line = annotation.start_line;
              message.end_line = annotation.end_line;
              flake.messages.push(message);
            }

            if (annotation.annotation_level === "failure") {
              workflow.failed_count++;
              test.test_failed_count++;
              flake.failures++;
              message.info = annotation.message;
              message.start_line = annotation.start_line;
              message.end_line = annotation.end_line;
              flake.messages.push(message);
            }

            test.test_flake_history.push(flake);
          }
        }

        workflow.test_runs.push(test);

        // update test run and workflow run passed counts
        if (checkRun.conclusion === "success") {
          workflow.passed_count += 1;
          test.test_passed_count += 1;
        }
      }

      return_data.workflow_runs_data.push(workflow);
    }
  } catch (err) {
    return_data.message = "Unable to fetch getFullTestWorkflowReport";
    return return_data;
  }

  window.localStorage.setItem("expireTime", moment().add(30, "m").valueOf());
  window.localStorage.setItem("workflows", JSON.stringify(return_data));
  return return_data;
};

async function _getLocalData() {
  // fetch data only within 45 min intervals for same machine
  const existingExpireTime = window.localStorage.getItem("expireTime");
  const fortyFiveMinsAgo = moment().subtract(45, "minutes").valueOf();

  if (!existingExpireTime) {
    return false;
  } else if (existingExpireTime && existingExpireTime > fortyFiveMinsAgo) {
    return true;
  } else {
    return false;
  }
}

async function _getDataFromLocal() {
  const rawOrigData = window.localStorage.getItem("workflows");

  if (!rawOrigData) {
    return false;
  }

  return JSON.parse(rawOrigData);
}

async function _checkForUpdate() {
  const rawOrigData = window.localStorage.getItem("workflows");
  const expiryTime = window.localStorage.getItem("expireTime");

  if (!expiryTime) {
    return false;
  }

  if (!rawOrigData) {
    return false;
  }

  const origData = JSON.parse(rawOrigData);
  const apiData = await _getSingleWorkflow(functionalTestsWorkflowId);

  const firstOrigData = origData.workflow_runs_data[0].workflow_run.id;
  const firstApiData = apiData[0].id;

  return firstApiData === firstOrigData;
}

const _delay = (ms) => new Promise((res) => setTimeout(res, ms));