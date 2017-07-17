/**
 * @license Copyright 2017 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

const PageDependencyGraph = require('../../../gather/computed/page-dependency-graph');
const Node = require('../../../gather/computed/dependency-graph/node');
const Runner = require('../../../runner.js');

const sampleTrace = require('../../fixtures/traces/progressive-app-m60.json');
const sampleDevtoolsLog = require('../../fixtures/traces/progressive-app-m60.devtools.log.json');

const assert = require('assert');

function createRequest(requestId, url, startTime, _initiator) {
  return {requestId, url, startTime, _initiator};
}

/* eslint-env mocha */
describe('PageDependencyGraph computed artifact:', () => {
  let computedArtifacts;

  beforeEach(() => {
    computedArtifacts = Runner.instantiateComputedArtifacts();
  });

  describe('#compute_', () => {
    it('should compute the dependency graph', () => {
      return computedArtifacts.requestPageDependencyGraph(
        sampleTrace,
        sampleDevtoolsLog
      ).then(output => {
        assert.ok(output instanceof Node, 'did not return a graph');

        const dependents = output.getDependents();
        const nodeWithNestedDependents = dependents.find(node => node.getDependents().length);
        assert.ok(nodeWithNestedDependents, 'did not link initiators');
      });
    });
  });

  describe('#createGraph', () => {
    it('should compute a simple graph', () => {
      const request1 = createRequest(1, '1', 0);
      const request2 = createRequest(2, '2', 5);
      const request3 = createRequest(3, '3', 5);
      const request4 = createRequest(4, '4', 10, {url: '2'});
      const networkRecords = [request1, request2, request3, request4];

      const graph = PageDependencyGraph.createGraph({}, networkRecords);
      const nodes = [];
      graph.traverse(node => nodes.push(node));

      assert.equal(nodes.length, 4);
      assert.deepEqual(nodes.map(node => node.id), [1, 2, 3, 4]);
      assert.deepEqual(nodes[0].getDependencies(), []);
      assert.deepEqual(nodes[1].getDependencies(), [nodes[0]]);
      assert.deepEqual(nodes[2].getDependencies(), [nodes[0]]);
      assert.deepEqual(nodes[3].getDependencies(), [nodes[1]]);
    });

    it('should compute a graph with duplicate URLs', () => {
      const request1 = createRequest(1, '1', 0);
      const request2 = createRequest(2, '2', 5);
      const request3 = createRequest(3, '2', 5); // duplicate URL
      const request4 = createRequest(4, '4', 10, {url: '2'});
      const networkRecords = [request1, request2, request3, request4];

      const graph = PageDependencyGraph.createGraph({}, networkRecords);
      const nodes = [];
      graph.traverse(node => nodes.push(node));

      assert.equal(nodes.length, 4);
      assert.deepEqual(nodes.map(node => node.id), [1, 2, 3, 4]);
      assert.deepEqual(nodes[0].getDependencies(), []);
      assert.deepEqual(nodes[1].getDependencies(), [nodes[0]]);
      assert.deepEqual(nodes[2].getDependencies(), [nodes[0]]);
      assert.deepEqual(nodes[3].getDependencies(), [nodes[0]]); // should depend on rootNode instead
    });
  });

  describe('#computeGraphDuration', () => {
    it('should compute graph duration', () => {
      //   B - C - D - E - F
      //  /               / \
      // A - * - * - * - *   G - H

      const nodeA = new Node('A');
      const nodeB = new Node('B');
      const nodeC = new Node('C');
      const nodeD = new Node('D');
      const nodeE = new Node('E');
      const nodeF = new Node('F');
      const nodeG = new Node('G');
      const nodeH = new Node('H');

      nodeA.addDependent(nodeB);
      nodeA.addDependent(nodeE);

      nodeB.addDependent(nodeC);
      nodeC.addDependent(nodeD);
      nodeD.addDependent(nodeE);
      nodeE.addDependent(nodeF);
      nodeF.addDependent(nodeG);

      nodeG.addDependent(nodeH);

      const result = PageDependencyGraph.computeGraphDuration(nodeA);
      assert.equal(result, 4500); // 7 hops * ~560ms latency/hop
    });
  });
});
