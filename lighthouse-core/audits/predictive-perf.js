/**
 * @license Copyright 2017 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

const Audit = require('./audit');
const Util = require('../report/v2/renderer/util.js');
const PageDependencyGraph = require('../gather/computed/page-dependency-graph.js');

// Parameters (in ms) for log-normal CDF scoring. To see the curve:
//   https://www.desmos.com/calculator/rjp0lbit8y
const SCORING_POINT_OF_DIMINISHING_RETURNS = 1700;
const SCORING_MEDIAN = 10000;

class PredictivePerf extends Audit {
  /**
   * @return {!AuditMeta}
   */
  static get meta() {
    return {
      category: 'Performance',
      name: 'predictive-perf',
      description: 'Predicted Performance (beta)',
      helpText: '',
      requiredArtifacts: ['traces', 'devtoolsLogs']
    };
  }

  /**
   * @param {!Artifacts} artifacts
   * @return {!AuditResult}
   */
  static audit(artifacts) {
    const trace = artifacts.traces[Audit.DEFAULT_PASS];
    const devtoolsLogs = artifacts.devtoolsLogs[Audit.DEFAULT_PASS];
    return artifacts.requestPageDependencyGraph(trace, devtoolsLogs).then(graph => {
      const rawValue = PageDependencyGraph.computeGraphDuration(graph);
      const score = Audit.computeLogNormalScore(
        rawValue,
        SCORING_POINT_OF_DIMINISHING_RETURNS,
        SCORING_MEDIAN
      );

      return {
        score,
        rawValue,
        displayValue: Util.formatMilliseconds(rawValue),
      };
    });
  }
}

module.exports = PredictivePerf;
