/**
 * @license Copyright 2017 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

const ComputedArtifact = require('./computed-artifact');
const Node = require('./dependency-graph/node');
const Emulation = require('../../lib/emulation');

class PageDependencyGraphArtifact extends ComputedArtifact {
  get name() {
    return 'PageDependencyGraph';
  }

  get requiredNumberOfArtifacts() {
    return 2;
  }

  static getNetworkInitiators(record) {
    if (!record._initiator) return [];
    if (record._initiator.url) return [record._initiator.url];
    if (record._initiator.type === 'script') {
      const frames = record._initiator.stack.callFrames;
      return Array.from(new Set(frames.map(frame => frame.url))).filter(Boolean);
    }

    return [];
  }

  static createGraph(traceOfTab, networkRecords) {
    const idToNodeMap = new Map();
    const urlToNodeMap = new Map();

    networkRecords.forEach(record => {
      const node = new Node(record.requestId);
      idToNodeMap.set(record.requestId, node);

      if (urlToNodeMap.has(record.url)) {
        // If duplicate requests have been made to this URL we can't be certain which node is being
        // referenced, so act like we don't know the URL at all.
        urlToNodeMap.set(record.url, undefined);
      } else {
        urlToNodeMap.set(record.url, node);
      }
    });

    const rootRequest = networkRecords
        .reduce((min, next) => min.startTime < next.startTime ? min : next);
    const rootNode = idToNodeMap.get(rootRequest.requestId);
    networkRecords.forEach(record => {
      const initiators = PageDependencyGraphArtifact.getNetworkInitiators(record);
      const node = idToNodeMap.get(record.requestId);
      if (initiators.length) {
        initiators.forEach(initiator => {
          const parent = urlToNodeMap.get(initiator) || rootNode;
          parent.addDependent(node);
        });
      } else if (record !== rootRequest) {
        rootNode.addDependent(node);
      }
    });

    return rootNode;
  }

  static computeGraphDuration(rootNode) {
    const depthByNodeId = new Map();
    const getMax = arr => Array.from(arr).reduce((max, next) => Math.max(max, next), 0);

    let startingMax = Infinity;
    let endingMax = Infinity;
    while (endingMax === Infinity || startingMax > endingMax) {
      startingMax = endingMax;
      endingMax = 0;

      rootNode.traverse(node => {
        const dependencies = node.getDependencies();
        const dependencyDepths = dependencies.map(node => depthByNodeId.get(node.id) || Infinity);
        const maxDepth = getMax(dependencyDepths);
        endingMax = Math.max(endingMax, maxDepth);
        depthByNodeId.set(node.id, maxDepth + 1);
      });
    }

    const maxDepth = getMax(depthByNodeId.values());
    return maxDepth * Emulation.settings.TYPICAL_MOBILE_THROTTLING_METRICS.latency;
  }

  /**
   * @param {!Trace} trace
   * @param {!DevtoolsLog} devtoolsLog
   * @param {!ComputedArtifacts} artifacts
   * @return {!Promise<!Object>}
   */
  compute_(trace, devtoolsLog, artifacts) {
    const promises = [
      artifacts.requestTraceOfTab(trace),
      artifacts.requestNetworkRecords(devtoolsLog),
    ];

    return Promise.all(promises).then(([traceOfTab, networkRecords]) => {
      return PageDependencyGraphArtifact.createGraph(traceOfTab, networkRecords);
    });
  }
}

module.exports = PageDependencyGraphArtifact;
