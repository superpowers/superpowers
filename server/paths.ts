import * as path from "path";
import * as fs from "fs";
import * as SupCore from "../SupCore";

import * as mkdirp from "mkdirp";
import * as yargs from "yargs";

let argv = yargs
  .describe("data-path", "Path to store/read data files from, including config and projects")
  .argv;

// User data folder
export let userData = path.join(__dirname, "..");

if (argv["data-path"] != null) {
  userData = path.resolve(argv["data-path"]);
} else {
  if (!fs.existsSync(path.join(userData, "config.json"))) {
    switch (process.platform) {
      case "win32":
        if (process.env.APPDATA != null) userData = path.join(process.env.APPDATA, "Superpowers");
        else SupCore.log("Warning: Could not find APPDATA environment variable.");
        break;
      case "darwin":
        if (process.env.HOME != null) userData = path.join(process.env.HOME, "Library", "Superpowers");
        else SupCore.log("Warning: Could not find HOME environment variable.");
        break;
      default:
        if (process.env.XDG_DATA_HOME != null) userData = path.join(process.env.XDG_DATA_HOME, "Superpowers");
        else if (process.env.HOME != null) userData = path.join(process.env.HOME, ".local/share", "Superpowers");
        else SupCore.log("Warning: Could not find neither XDG_DATA_HOME nor HOME environment variables.");
    }
  }
}

export let projects = path.join(userData, "projects");
export let builds = path.join(userData, "builds");
export let config = path.join(userData, "config.json");

SupCore.log(`Using data from ${userData}.`);

try { mkdirp.sync(userData); } catch (err) { if (err.code !== "EEXIST") throw err; }
try { mkdirp.sync(projects); } catch (err) { if (err.code !== "EEXIST") throw err; }
try { mkdirp.sync(builds); } catch (err) { if (err.code !== "EEXIST") throw err; }

export function getLocalizedFilename(filename: string, language: string) {
  if (language === "en") return filename;
  let [ basename, extension ] = filename.split(".");
  return `${basename}.${language}.${extension}`;
}
