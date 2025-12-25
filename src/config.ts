import * as vscode from "vscode";
import {
  CONFIG_BASE,
  CONFIG_API_KEY,
  CONFIG_MODEL,
  CONFIG_OUTPUT_METHOD,
  CONFIG_SHOW_PREVIEW,
  CONFIG_ENABLE_STATEFUL_SESSIONS,
  CONFIG_SUBMIT_WITH_EDITOR,
  CONFIG_LAST_RESPONSE_ID,
} from "./const";

function getConfigValue(config: string, key: string) {
  return vscode.workspace.getConfiguration(config).get<string>(key);
}

function setConfigValue(config: string, key: string, value: string) {
  return vscode.workspace
    .getConfiguration(config)
    .update(key, value, vscode.ConfigurationTarget.Global);
}

export async function getApiKey() {
  return await getConfigValue(CONFIG_BASE, CONFIG_API_KEY);
}

export async function setApiKey(apiKey: string): Promise<void> {
  await setConfigValue(CONFIG_BASE, CONFIG_API_KEY, apiKey);
}

export async function getModel(): Promise<string | undefined> {
  return getConfigValue(CONFIG_BASE, CONFIG_MODEL);
}

export async function getOutputMethod(): Promise<string | undefined> {
  return getConfigValue(CONFIG_BASE, CONFIG_OUTPUT_METHOD);
}

export async function getShowPreview(): Promise<string | undefined> {
  return getConfigValue(CONFIG_BASE, CONFIG_SHOW_PREVIEW);
}

export async function getEnableStatefulSessions(): Promise<boolean | undefined> {
  return vscode.workspace.getConfiguration(CONFIG_BASE).get<boolean>(CONFIG_ENABLE_STATEFUL_SESSIONS);
}

export async function getSubmitWithEditor(): Promise<boolean | undefined> {
  return vscode.workspace.getConfiguration(CONFIG_BASE).get<boolean>(CONFIG_SUBMIT_WITH_EDITOR);
}

export async function getLastResponseId(): Promise<string | undefined> {
  // Merged config read: prefers workspace > global (reliable for per-workspace persistence).
  // No folder scoping needed (VS Code merges folder/workspace/user automatically).
  return vscode.workspace.getConfiguration(CONFIG_BASE).get<string>(CONFIG_LAST_RESPONSE_ID);
}

export async function setLastResponseId(id: string): Promise<void> {
  const hasWorkspace = vscode.workspace.workspaceFolders !== undefined && vscode.workspace.workspaceFolders.length > 0;
  const target = hasWorkspace ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
  // Per-workspace persistence (writes to .vscode/settings.json) when workspace open; global fallback (rare, no workspace).
  // Matches package.json "scope": "workspace"; async/non-blocking.
  await vscode.workspace.getConfiguration(CONFIG_BASE).update(
    CONFIG_LAST_RESPONSE_ID, 
    id, 
    target
  );
}

 