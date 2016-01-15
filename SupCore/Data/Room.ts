import * as SupData from "./index";
import * as path from "path";
import * as fs from "fs";

export default class Room extends SupData.Base.Hash {
  static schema: SupCore.Data.Schema = {
    history: {
      type: "array",
      items: {
        type: "hash",
        properties: {
          timestamp: { type: "number" },
          author: { type: "string" },
          text: { type: "string" },
          users: { type: "array" }
        }
      }
    }
  };

  users: SupData.RoomUsers;

  constructor(pub: any) {
    super(pub, Room.schema);

    if (this.pub != null) this.users = new SupData.RoomUsers(this.pub.users);
  }

  load(roomPath: string) {
    fs.readFile(path.join(`${roomPath}.json`), { encoding: "utf8" }, (err, json) => {
      if (err != null && err.code !== "ENOENT") throw err;

      if (json == null) this.pub = { history: [] };
      else this.pub = JSON.parse(json);

      this.pub.users = [];
      this.users = new SupData.RoomUsers(this.pub.users);

      this.emit("load");
    });
  }

  unload() { this.removeAllListeners(); return; }

  save(roomPath: string, callback: (err: Error) => any) {
    let users = this.pub.users;
    delete this.pub.users;
    let json = JSON.stringify(this.pub, null, 2);
    this.pub.users = users;

    fs.writeFile(path.join(`${roomPath}.json`), json, { encoding: "utf8" }, callback);
  }

  join(client: any, callback: (err: string, item?: any, index?: number) => any) {
    let item = this.users.byId[client.socket.username];
    if (item != null) {
      item.connectionCount++;
      callback(null, item);
      return;
    }

    item = { id: client.socket.username, connectionCount: 1 };

    this.users.add(item, null, (err, actualIndex) => {
      if (err != null) { callback(err); return; }
      callback(null, item, actualIndex);
    });
  }

  client_join(item: any, index: number) {
    if (index != null) this.users.client_add(item, index);
    else this.users.byId[item.id].connectionCount++;
  }

  leave(client: any, callback: (err: string, username?: any) => any) {
    let item = this.users.byId[client.socket.username];
    if (item.connectionCount > 1) {
      item.connectionCount--;
      callback(null, client.socket.username);
      return;
    }

    this.users.remove(client.socket.username, (err) => {
      if (err != null) { callback(err); return; }
      callback(null, client.socket.username);
    });
  }

  client_leave(id: string) {
    let item = this.users.byId[id];
    if (item.connectionCount > 1) { item.connectionCount--; return; }

    this.users.client_remove(id);
  }

  server_appendMessage(client: any, text: string, callback: (err: string, entry?: any) => any) {
    if (typeof(text) !== "string" || text.length > 300) { callback("Your message was too long"); return; }

    let entry = { timestamp: Date.now(), author: client.socket.username, text: text };
    this.pub.history.push(entry);
    if (this.pub.history.length > 100) this.pub.history.splice(0, 1);

    callback(null, entry);
    this.emit("change");
  }

  client_appendMessage(entry: any) {
    this.pub.history.push(entry);
    if (this.pub.history.length > 100) this.pub.history.splice(0, 1);
  }
}
