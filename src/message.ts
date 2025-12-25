import * as vscode from "vscode";
import {
  getFilesList,
  readFileAsUtf8
} from "./editor";
import { MessageType } from "./types";


export async function getWorkspaceRawContent(): Promise<string> {
  const uris = await getFilesList();
  if (!uris.length) {
    vscode.window.showErrorMessage("No files found in workspace!");
    throw new Error("No workspace files");
  }
  const content = (
    await Promise.all(
      uris.map(async (uri) => ({
        path: uri.path,
        content: await readFileAsUtf8(uri),
      }))
    )
  ).reduce(
    (buffer, file, i) =>
      `${buffer}${i ? "\n\n" : ""}${file.path}\n${file.content}`,
    ""
  );
  return content;
}

export function buildPrompt(type: MessageType, rawContent: string, question: string): string {
  let prefix: string;
  switch (type) {
    case "workspace":
      prefix = "Please consider the following project files:";
      break;
    case "tab":
      prefix = "Please consider the following project file:";
      break;
    case "function":
      prefix = "Please consider the following function/method:";
      break;
    case "selection":
      prefix = "Please consider the following code:";
      break;
    default:
      return "";
  }
  return [
    prefix,
    rawContent,
    `Question: ${question}`,
  ].join("\n\n");
}

 