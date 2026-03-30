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
  CONFIG_LAST_RESPONSE_TIMESTAMP,
  CONFIG_TOKENS_PER_REQUEST,
  CONFIG_CAPTURE_RESPONSE_DATA,
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

/*export async function getLastResponseId(context: vscode.ExtensionContext): Promise<string | undefined> {
  // Retrieves the last response ID from ExtensionContext.workspaceState.
  // Persists per-workspace across VS Code sessions/reloads (tied to workspace folder index).
  // Returns undefined if not previously set.
  return context.workspaceState.get(CONFIG_LAST_RESPONSE_ID) ?? '';
}*/

export async function clearLastResponse(context: vscode.ExtensionContext): Promise<void> {
  await context.workspaceState.update(CONFIG_LAST_RESPONSE_ID, undefined);
  await context.workspaceState.update(CONFIG_LAST_RESPONSE_TIMESTAMP, undefined);
}

export async function getLastResponseId(context: vscode.ExtensionContext): Promise<string> {
  // Retrieves the last response ID from ExtensionContext.workspaceState.
  // Persists per-workspace across VS Code sessions/reloads (tied to workspace folder index).
  // Returns undefined if not previously set.
  const id = context.workspaceState.get(CONFIG_LAST_RESPONSE_ID) as string | undefined;
  if (!id || id === '') {
    return '';
  }

  // Time-based validation: If the stored response ID is older than 30 days, clear it and return undefined.
  const timestamp = context.workspaceState.get(CONFIG_LAST_RESPONSE_TIMESTAMP) as string | undefined;
  if (!timestamp) {
    await clearLastResponse(context);
    return '';
  }

  const timestampDate = new Date(timestamp);
  if (isNaN(timestampDate.getTime())) {
    await clearLastResponse(context);
    return '';
  }

  const now = new Date();
  const ageMs = now.getTime() - timestampDate.getTime();
  // 30 days minus 1 second: 29 days, 23h, 59m, 59s
  const THRESHOLD_MS = ( 30 * 24 * 60 * 60 * 1000 ) - 1000;
  if (ageMs > THRESHOLD_MS) {
    await clearLastResponse(context);
    return '';
  }

  return id;
}

export async function setLastResponseId(context: vscode.ExtensionContext, id: string): Promise<void> {
  // Stores the last response ID in ExtensionContext.workspaceState for
  // per-workspace persistence; Survives workspace closing/reopening; 
  // Also sets timestamp to enable age-based validation
  // and cleanup of stale IDs (e.g., older than 30 days).
  await context.workspaceState.update(CONFIG_LAST_RESPONSE_ID, id);
  await context.workspaceState.update(CONFIG_LAST_RESPONSE_TIMESTAMP, new Date().toISOString());
}

export async function getTokensPerRequest(): Promise<number | undefined> {
  return vscode.workspace.getConfiguration(CONFIG_BASE).get<number>(
    CONFIG_TOKENS_PER_REQUEST
  );
}

export async function isCaptureRawResponses(): Promise<boolean | undefined> {
  return vscode.workspace.getConfiguration(CONFIG_BASE).get<boolean>(
    CONFIG_CAPTURE_RESPONSE_DATA
  );
}
