import * as vscode from "vscode";
import { getApiKey, getModel, setApiKey, getEnableStatefulSessions, setLastResponseId, getLastResponseId } from "./config";
import { promptForApiKey, promptForQuestion } from "./ui";
import { Context } from "./types";

export async function ensureWorkspaceOpen(): Promise<vscode.WorkspaceFolder> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage("No workspace folder open!");
    throw new Error("No workspace");
  }
  return workspaceFolder;
}

export async function ensureApiKey(): Promise<string> {
  let apiKey = await getApiKey();
  if (!apiKey) {
    apiKey = await promptForApiKey();
    if (apiKey) {
      await setApiKey(apiKey);
    } else {
      vscode.window.showErrorMessage("API Key is required!");
      throw new Error("No API key");
    }
  }
  return apiKey;
}

export async function ensureQuestion(): Promise<string> {
  const question = await promptForQuestion();
  if (!question) {
    vscode.window.showErrorMessage("A question is required!");
    throw new Error("No question");
  }
  return question;
}

export async function ensureModel(): Promise<string> {
  const model = await getModel();
  if (!model) {
    vscode.window.showErrorMessage("xAI model is required!");
    throw new Error("No model");
  }
  return model;
}

export async function prepareContextWithoutQuestion(): Promise<Omit<Context, 'question'>> {
  const apiKey = await ensureApiKey();
  const model = await ensureModel();
  const stateful = (await getEnableStatefulSessions()) ?? false;
  return { apiKey, model, stateful };
}

export async function prepareWorkspaceContextWithoutQuestion(): Promise<Omit<Context, 'question'> & { workspaceFolder: vscode.WorkspaceFolder }> {
  const workspaceFolder = await ensureWorkspaceOpen();
  return {
    workspaceFolder,
    ...await prepareContextWithoutQuestion(),
  };
}

// Initializes vscodeGrok.lastResponseId to "" in workspace settings.json if it does not exist
// (i.e., getLastResponseId() === undefined). Only runs if stateful === true.
// Called from handleAskGrok after context prep, before API send. Minimal/async-safe.
export async function initGrokLastResponseIDparam(stateful: boolean): Promise<void> {
  if (!stateful) {
    return;
  }
  const currentId = await getLastResponseId();
  if (currentId === undefined || currentId === null) {
    // Creates key in workspace settings.json (or global fallback) with empty string.
    // Matches setLastResponseId behavior; proactive init avoids read gaps on new workspaces.
    await setLastResponseId("");
  }
}

