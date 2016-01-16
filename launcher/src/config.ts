import * as servers from "./panes/servers";

// NOTE: This probably doesn't belong in the config
export let hasRequestedClose = false;

const serversJSON = localStorage.getItem("superpowers.servers");
export const serverEntries =
  (serversJSON != null) ? JSON.parse(serversJSON)
  : [ { name: "My Server", address: "127.0.0.1:4237" } ];

const autoStartServerJSON = localStorage.getItem("superpowers.autoStartServer");
export let autoStartServer = (autoStartServerJSON != null) ? JSON.parse(autoStartServerJSON) : true;

export function save() {
  serverEntries.length = 0;
  for (const liElt of servers.serversTreeView.treeRoot.children) {
    serverEntries.push({ name: liElt.dataset.name, address: liElt.dataset.address});
  }

  localStorage.setItem("superpowers.servers", JSON.stringify(serverEntries));
  localStorage.setItem("superpowers.autoStartServer", JSON.stringify(autoStartServer));
}
