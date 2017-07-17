/**
 * @license Copyright 2017 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

class Node {
  constructor(id) {
    this._id = id;
    this._dependents = [];
    this._dependencies = [];
  }

  get id() {
    return this._id;
  }

  getDependents() {
    return this._dependents.slice();
  }

  getDependencies() {
    return this._dependencies.slice();
  }

  getRootNode() {
    let rootNode = this;
    while (rootNode._dependencies.length) {
      rootNode = rootNode._dependencies[0];
    }

    return rootNode;
  }

  addDependent(node) {
    node.addDependency(this);
  }

  addDependency(node) {
    if (this._dependencies.includes(node)) {
      return;
    }

    node._dependents.push(this);
    this._dependencies.push(node);
  }

  cloneWithoutRelationships() {
    return new Node(this.id);
  }

  cloneWithRelationships(predicate) {
    const rootNode = this.getRootNode();

    let shouldIncludeNode = () => true;
    if (predicate) {
      const idsToInclude = new Set();
      rootNode.traverse(node => {
        if (predicate(node)) {
          node.traverse(
            node => idsToInclude.add(node.id),
            node => node._dependencies.filter(parent => !idsToInclude.has(parent))
          );
        }
      });

      shouldIncludeNode = node => idsToInclude.has(node.id);
    }

    const idToNodeMap = new Map();
    rootNode.traverse(originalNode => {
      if (!shouldIncludeNode(originalNode)) return;
      const clonedNode = originalNode.cloneWithoutRelationships();
      idToNodeMap.set(clonedNode.id, clonedNode);

      for (const dependency of originalNode._dependencies) {
        const clonedDependency = idToNodeMap.get(dependency.id);
        clonedNode.addDependency(clonedDependency);
      }
    });

    return idToNodeMap.get(this.id);
  }

  _traversePaths(iterator, getList) {
    const stack = [[this]];
    while (stack.length) {
      const path = stack.shift();
      const node = path[0];
      iterator(node, path);

      const nodesToAdd = getList(node);
      for (const nextNode of nodesToAdd) {
        stack.push([nextNode].concat(path));
      }
    }
  }

  traverse(iterator, getNext) {
    if (!getNext) {
      getNext = node => node.getDependents();
    }

    const visited = new Set();
    const originalGetNext = getNext;

    getNext = node => {
      visited.add(node.id);
      const allNodesToVisit = originalGetNext(node);
      const nodesToVisit = allNodesToVisit.filter(nextNode => !visited.has(nextNode.id));
      nodesToVisit.forEach(nextNode => visited.add(nextNode.id));
      return nodesToVisit;
    };

    this._traversePaths(iterator, getNext);
  }
}

module.exports = Node;
