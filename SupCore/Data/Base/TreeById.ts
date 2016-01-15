import * as base from "./index";
import { EventEmitter } from "events";

interface TreeNode {
  id: string;
  name: string;
  children?: TreeNode[];
  [name: string]: any;
}

export default class TreeById extends EventEmitter {
  pub: TreeNode[];
  nextId: number;

  byId: { [key: string]: TreeNode };
  parentNodesById: { [key: string]: TreeNode };

  constructor(pub: any, public schema: SupCore.Data.Schema, nextId?: number) {
    super();
    this.pub = pub;
    this.nextId = nextId;

    this.byId = {};
    this.parentNodesById = {};

    let maxNodeId = -1;
    this.walk((node, parentNode) => {
      // NOTE: Legacy stuff from Superpowers 0.4
      if (typeof node.id === "number") node.id = node.id.toString();

      maxNodeId = Math.max(maxNodeId, parseInt(node.id, 10));
      this.byId[node.id] = node;
      this.parentNodesById[node.id] = parentNode;
    });

    if (this.nextId == null) this.nextId = maxNodeId + 1;
  }

  walk(callback: (node: TreeNode, parentNode?: TreeNode) => any) {
    for (let node of this.pub) this.walkNode(node, null, callback);
  }

  walkNode(node: TreeNode, parentNode: TreeNode, callback: (node: TreeNode, parentNode?: TreeNode) => any) {
    callback(node, parentNode);

    if (node.children != null) {
      for (let child of node.children) this.walkNode(child, node, callback);
    }
  }

  getPathFromId(id: string): string {
    let name = this.byId[id].name;
    let parent = this.parentNodesById[id];
    while(true) {
      if (parent == null) break;
      name = `${parent.name}/${name}`;
      parent = this.parentNodesById[parent.id];
    }

    return name;
  }

  add(node: TreeNode, parentId: string, index: number, callback: (err: string, index?: number) => any) {
    if (node.id != null && this.schema["id"] == null) { callback("Found unexpected id key"); return; }

    let siblings = this.pub;
    if (parentId != null) siblings = (this.byId[parentId] != null) ? this.byId[parentId].children : null;
    if (siblings == null) { callback(`Invalid parent id: ${parentId}`); return; }

    let missingKeys = Object.keys(this.schema);
    for (let key in node) {
      let value = node[key];
      let rule = this.schema[key];
      if (rule == null) {
        if(key === "id" && value == null) continue;
        callback(`Invalid key: ${key}`);
        return;
      }
      let violation = base.getRuleViolation(value, rule, true);
      if (violation != null) { callback(`Invalid value for ${key}: ${base.formatRuleViolation(violation)}`); return; }

      missingKeys.splice(missingKeys.indexOf(key), 1);
    }

    if (missingKeys.length > 0) { callback(`Missing key: ${missingKeys[0]}`); return; }

    if (node.id == null) {
      node.id = this.nextId.toString();
      this.nextId++;
    }
    this.byId[node.id] = node;
    this.parentNodesById[node.id] = this.byId[parentId];

    // Fix index if it's out of bounds
    if (index == null || index < 0 || index > siblings.length) index = siblings.length;
    siblings.splice(index, 0, node);

    callback(null, index);
    this.emit("change");
  }

  client_add(node: TreeNode, parentId: string, index: number) {
    let siblings = this.pub;
    if (parentId != null) siblings = (this.byId[parentId] != null) ? this.byId[parentId].children : null;
    siblings.splice(index, 0, node);

    this.byId[node.id] = node;
    this.parentNodesById[node.id] = this.byId[parentId];
  }


  move(id: string, parentId: string, index: number, callback: (err: string, index?: number) => any) {
    let node = this.byId[id];
    if (node == null) { callback(`Invalid node id: ${id}`); return; }

    let parentNode: TreeNode = null;
    if (parentId != null) {
      parentNode = this.byId[parentId];
      if (parentNode == null || parentNode.children == null) { callback(`Invalid parent node id: ${parentId}`); return; }
    }

    // Adjust insertion index if needed
    let siblings = (parentNode != null) ? parentNode.children : this.pub;
    if (index == null || index < 0 || index > siblings.length) index = siblings.length;

    let oldSiblings = (this.parentNodesById[id] != null) ? this.parentNodesById[id].children : this.pub;
    let oldIndex = oldSiblings.indexOf(node);
    oldSiblings.splice(oldIndex, 1);

    let actualIndex = index;
    if (siblings === oldSiblings && oldIndex < actualIndex) actualIndex--;
    siblings.splice(actualIndex, 0, node);

    this.parentNodesById[id] = parentNode;

    callback(null, index);
    this.emit("change");
  }

  client_move(id: string, parentId: string, index: number) {
    let node = this.byId[id];

    let parentNode = (parentId != null) ? this.byId[parentId] : null;
    let siblings = (parentNode != null) ? this.byId[parentId].children : this.pub;

    let oldSiblings = (this.parentNodesById[id] != null) ? this.parentNodesById[id].children : this.pub;
    let oldIndex = oldSiblings.indexOf(node);
    oldSiblings.splice(oldIndex, 1);

    let actualIndex = index;
    if (siblings === oldSiblings && oldIndex < actualIndex) actualIndex--;
    siblings.splice(actualIndex, 0, node);

    this.parentNodesById[id] = parentNode;
  }


  remove(id: string, callback: (err: string) => any) {
    let node = this.byId[id];
    if (node == null) { callback(`Invalid node id: ${id}`); return; }

    let siblings = (this.parentNodesById[id] != null) ? this.parentNodesById[id].children : this.pub;
    siblings.splice(siblings.indexOf(node), 1);

    this.walkNode(node, null, (node: TreeNode, parentNode?: TreeNode) => {
      delete this.parentNodesById[node.id];
      delete this.byId[node.id];
    });

    callback(null);
    this.emit("change");
  }

  client_remove(id: string) {
    let node = this.byId[id];

    let siblings = (this.parentNodesById[id] != null) ? this.parentNodesById[id].children : this.pub;
    siblings.splice(siblings.indexOf(node), 1);

    this.walkNode(node, null, (node: TreeNode, parentNode?: TreeNode) => {
      delete this.parentNodesById[node.id];
      delete this.byId[node.id];
    });
  }

  // clear() {}

  setProperty(id: string, path: string, value: any, callback: (err: string, value?: any) => any) {
    let node = this.byId[id];
    if (node == null) { callback(`Invalid node id: ${id}`); return; }

    let parts = path.split(".");

    let rule = this.schema[parts[0]];
    for (let part of parts.slice(1)) {
      rule = rule.properties[part];
      if (rule.type === "any") break;
    }

    if (rule == null) { callback(`Invalid key: ${path}`); return; }
    if (rule.type !== "any") {
      let violation = base.getRuleViolation(value, rule);
      if (violation != null) { callback(`Invalid value for ${path}: ${base.formatRuleViolation(violation)}`); return; }
    }

    for (let part of parts.slice(0, parts.length - 1)) node = node[part];
    node[parts[parts.length - 1]] = value;

    callback(null, value);
    this.emit("change");
  }

  client_setProperty(id: string, path: string, value: any) {
    let parts = path.split(".");

    let node = this.byId[id];
    for (let part of parts.slice(0, parts.length - 1)) node = node[part];
    node[parts[parts.length - 1]] = value;
  }
}
