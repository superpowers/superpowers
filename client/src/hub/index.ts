import CreateOrEditProjectDialog, { SystemsData } from "./CreateOrEditProjectDialog";
import * as async from "async";

import * as TreeView from "dnd-tree-view";

const data: {
  projects: SupCore.Data.Projects;
  systemsById: SystemsData;
} = {} as any;

const ui: { projectsTreeView?: any } = {};
let socket: SocketIOClient.Socket;
const port = (window.location.port.length === 0) ? "80" : window.location.port;

const languageNamesById: { [id: string]: string; } = {};
if (localStorage.getItem("superpowers-dev-mode") != null) languageNamesById["none"] = "None";

function start() {
  document.querySelector(".server-name").textContent = SupClient.i18n.t(`hub:serverAddress`, { hostname: window.location.hostname, port });

  ui.projectsTreeView = new TreeView(document.querySelector(".projects-tree-view") as HTMLElement, { multipleSelection: false });
  ui.projectsTreeView.on("selectionChange", onProjectSelectionChange);
  ui.projectsTreeView.on("activate", onProjectActivate);

  document.querySelector(".projects-buttons .new-project").addEventListener("click", onNewProjectClick);
  document.querySelector(".projects-buttons .open-project").addEventListener("click", onProjectActivate);
  document.querySelector(".projects-buttons .edit-project").addEventListener("click", onEditProjectClick);

  const selectLanguageElt = document.querySelector("select.language") as HTMLSelectElement;
  const languageIds = Object.keys(languageNamesById);
  languageIds.sort((a, b) => {
    // Always sort "None" at the end
    if (a === "none") return 1;
    if (b === "none") return -1;
    return languageNamesById[a].localeCompare(languageNamesById[b]);
  });

  for (const languageId of languageIds) SupClient.html("option", { parent: selectLanguageElt, value: languageId, textContent: languageNamesById[languageId] });
  selectLanguageElt.value = SupClient.cookies.get("supLanguage");

  document.querySelector("select.language").addEventListener("change", (event: any) => {
    SupClient.cookies.set("supLanguage", event.target.value, { expires: 7 });
    window.location.reload();
  });

  socket = SupClient.connect(null, { reconnection: true });

  socket.on("error", onConnectionError);
  socket.on("connect", onConnected);
  socket.on("disconnect", onDisconnected);

  socket.on("add:projects", onProjectAdded);
  socket.on("setProperty:projects", onSetProjectProperty);
  socket.on("updateIcon:projects", onUpdateProjectIcon);
}

const i18nFiles: SupClient.i18n.File[] = [ { root: "/", name: "hub" } ];
loadSystemsInfo(() => {
  async.each(SupClient.i18n.languageIds, (languageId, cb) => {
    SupClient.fetch(`/locales/${languageId}/common.json`, "json", (err, data) => {
       languageNamesById[languageId] = data.activeLanguage;
       cb();
    });
  }, () => {
    SupClient.i18n.load(i18nFiles, start);
  });
});

interface SystemManifest {
  title: string;
  description: string;
}

function loadSystemsInfo(callback: Function) {
  data.systemsById = {};

  SupClient.fetch("/systems.json", "json", (err: Error, systemsInfo: SupCore.SystemsInfo) => {
    async.each(systemsInfo.list, (systemId, cb) => {
      i18nFiles.push({ root: `/systems/${systemId}`, name: "system", context: `system-${systemId}` });
      SupClient.fetch(`/systems/${systemId}/templates.json`, "json", (err: Error, templatesList: string[]) => {
        for (const templateName of templatesList) {
          i18nFiles.push({
            root: `/systems/${systemId}/templates/${templateName}`,
            name: "template",
            context: `${systemId}-${templateName}`
          });
        }

        data.systemsById[systemId] = templatesList;
        cb();
      });
    }, () => { callback(); });
  });
}

// Network callbacks
function onConnectionError() {
  window.location.replace("/login");
}

function onConnected() {
  socket.emit("sub", "projects", null, onProjectsReceived);

  const buttons = document.querySelectorAll(".projects-buttons button") as NodeListOf<HTMLButtonElement>;
  buttons[0].disabled = false;
  const noSelection = ui.projectsTreeView.selectedNodes.length === 0;
  for (let i = 1; i < buttons.length; i++) buttons[i].disabled = noSelection;
}

function onDisconnected() {
  SupClient.Dialogs.cancelDialogIfAny();

  data.projects = null;

  ui.projectsTreeView.clearSelection();
  ui.projectsTreeView.treeRoot.innerHTML = "";
  const buttons = document.querySelectorAll(".projects-buttons button") as NodeListOf<HTMLButtonElement>;
  for (let i = 0; i < buttons.length; i++) buttons[i].disabled = true;

  (document.querySelector(".tree-loading") as HTMLDivElement).hidden = false;
}

function onProjectsReceived(err: string, projects: SupCore.Data.ProjectManifestPub[]) {
  data.projects = new SupCore.Data.Projects(projects);

  ui.projectsTreeView.clearSelection();
  ui.projectsTreeView.treeRoot.innerHTML = "";

  for (const manifest of projects) {
    const liElt = createProjectElement(manifest);
    ui.projectsTreeView.append(liElt, "item");
  }

  (document.querySelector(".tree-loading") as HTMLDivElement).hidden = true;
}

function onProjectAdded(manifest: SupCore.Data.ProjectManifestPub, index: number) {
  data.projects.client_add(manifest, index);

  const liElt = createProjectElement(manifest);
  ui.projectsTreeView.insertAt(liElt, "item", index);
}

function onSetProjectProperty(id: string, key: string, value: any) {
  data.projects.client_setProperty(id, key, value);

  const projectElt = ui.projectsTreeView.treeRoot.querySelector(`[data-id='${id}']`);

  switch (key) {
    case "name":
      projectElt.querySelector(".name").textContent = value;
      break;
    case "description":
      projectElt.querySelector(".description").textContent = value;
      break;
  }
}

function onUpdateProjectIcon(id: string) {
  const projectElt = ui.projectsTreeView.treeRoot.querySelector(`[data-id='${id}']`);
  const iconElt = projectElt.querySelector("img") as HTMLImageElement;
  iconElt.src = `/projects/${id}/icon.png?${Date.now()}`;
}

// User interface
function createProjectElement(manifest: SupCore.Data.ProjectManifestPub) {
  const liElt = SupClient.html("li", { dataset: { id: manifest.id} });

  SupClient.html("img", { parent: liElt, src: `/projects/${manifest.id}/icon.png` });

  const infoElt = SupClient.html("div", "info", { parent: liElt });
  SupClient.html("div", "name", { parent: infoElt, textContent: manifest.name });

  const detailsElt = SupClient.html("div", "details", { parent: infoElt });
  SupClient.html("span", "description", { parent: detailsElt, textContent: manifest.description });
  SupClient.html("span", "project-type", { parent: detailsElt, textContent: SupClient.i18n.t(`system-${manifest.systemId}:title`) });

  return liElt;
}

function onProjectSelectionChange() {
  const buttons = document.querySelectorAll(".projects-buttons button") as NodeListOf<HTMLButtonElement>;
  buttons[0].disabled = false;
  const noSelection = ui.projectsTreeView.selectedNodes.length === 0;
  for (let i = 1; i < buttons.length; i++) buttons[i].disabled = noSelection;
}

function onProjectActivate() {
  const projectId = ui.projectsTreeView.selectedNodes[0].dataset["id"];
  const href = `/project/?project=${projectId}`;

  if (SupApp != null) SupApp.openWindow(`${window.location.origin}${href}`);
  else window.location.href = href;
}

let autoOpenProject = true;
function onNewProjectClick() {
  new CreateOrEditProjectDialog(data.systemsById, { autoOpen: autoOpenProject }, (result) => {
    if (result == null) return;
    autoOpenProject = result.open;

    socket.emit("add:projects", result.project, onProjectAddedAck);
  });
}

function onProjectAddedAck(err: string, id: string) {
  if (err != null) { new SupClient.Dialogs.InfoDialog(err); return; }

  ui.projectsTreeView.clearSelection();

  const node = ui.projectsTreeView.treeRoot.querySelector(`li[data-id='${id}']`);
  ui.projectsTreeView.addToSelection(node);
  ui.projectsTreeView.scrollIntoView(node);

  if (autoOpenProject) onProjectActivate();
}

function onEditProjectClick() {
  if (ui.projectsTreeView.selectedNodes.length !== 1) return;

  const selectedNode = ui.projectsTreeView.selectedNodes[0];
  const existingProject = data.projects.byId[selectedNode.dataset["id"]];

  new CreateOrEditProjectDialog(data.systemsById, { existingProject }, (result) => {
    if (result == null) return;
    autoOpenProject = result.open;

    delete result.project.systemId;
    if (result.project.icon == null) delete result.project.icon;

    socket.emit("edit:projects", existingProject.id, result.project, (err: string) => {
      if (err != null) { new SupClient.Dialogs.InfoDialog(err); return; }
    });
  });
}
