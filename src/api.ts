import axios from "axios";
import { API_URL, API_URL_STATEFUL } from "./const";
import { getLastResponseId, setLastResponseId } from "./config";
import { GrokAPIResponse } from "./types";
// Temporary: Capture json output from Stateful API
// Used for short-term testing and debugging
import * as vscode from "vscode";
import * as path from "path";

// Temporary: Capture json output from Stateful API
// Standalone function to capture raw JSON from /v1/responses for debugging parsing issues.
// Called only when stateful=true, writes to workspace/debug/StatefulGrokResponses/<id>_<date>.jsonc
// Handles dir creation, .gitignore append (if new dir + file exists), unique local-time filenames.
// All ops async/non-blocking via vscode.workspace.fs; silent skip if no workspace.
async function debugWriteRawResponseToFile(responseData: any, responseId: string): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    console.warn('No workspace folder for StatefulGrok debug capture.');
    return;
  }
  // If multi-root workspace, use first workspace folder
  const workspaceFolder = workspaceFolders[0];
  const rootPath = workspaceFolder.uri.fsPath;
  const debugDirPath = path.join(rootPath, 'debug', 'StatefulGrokResponses');
  const debugDirUri = vscode.Uri.file(debugDirPath);
  let dirExists = true;
  try {
    await vscode.workspace.fs.stat(debugDirUri);
  } catch {
    dirExists = false;
    await vscode.workspace.fs.createDirectory(debugDirUri);
    // Append to .gitignore only if creating dir and file exists
    const gitignorePath = path.join(rootPath, '.gitignore');
    const gitignoreUri = vscode.Uri.file(gitignorePath);
    try {
      const gitignoreContent = await vscode.workspace.fs.readFile(gitignoreUri);
      const gitignoreText = Buffer.from(gitignoreContent).toString('utf-8');
      const lines = gitignoreText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      if (!lines.some(l => l === 'debug/**')) {
        let newText = gitignoreText;
        if (!gitignoreText.endsWith('\n')) {
          newText += '\n';
        }
        newText += '\n\n# Grok Responses Debug Output\ndebug/**\n\n';
        await vscode.workspace.fs.writeFile(gitignoreUri, Buffer.from(newText, 'utf-8'));
      }
    } catch (e) {
      // No .gitignore or read/write error: skip (don't create file).
      console.warn('Could not update .gitignore for debug dir:', e);
    }
  }
  // Generate unique local-time filename (DDMMMYYYY-hhmm, machine TZ).
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const month = monthNames[now.getMonth()];
  const year = now.getFullYear();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const dateStr = `${day}${month}${year}-${hours}${minutes}`;
  const safeId = responseId || 'unknown-response-id';
  const filename = `${safeId}_${dateStr}.jsonc`;
  const filePath = path.join(debugDirPath, filename);
  const fileUri = vscode.Uri.file(filePath);
  // Prepend 2-line comment, then pretty JSON (jsonc-compatible).
  const comment = `// Raw JSON captured from Grok /v1/responses Stateful Endpoint\n// Response ID: ${responseId}\n`;
  const jsonStr = JSON.stringify(responseData, null, 2);
  const fullContent = comment + jsonStr;
  await vscode.workspace.fs.writeFile(fileUri, Buffer.from(fullContent, 'utf-8'));
}

export async function sendToGrok(
  apiKey: string,
  model: string,
  content: string,
  stateful: boolean,
  context: vscode.ExtensionContext
): Promise<GrokAPIResponse> {
  const url = stateful ? API_URL_STATEFUL : API_URL;
  let response;
  if (stateful) {
    const previousId = await getLastResponseId(context);
    const body = {
      input: [{ role: "user" as const, content }],
      model,
      stream: false,
      temperature: 0,
      store: true,
      ...(previousId && { previous_response_id: previousId }),
    };
    response = await axios.post(url, body, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });
    if (response.data.id) {
      await setLastResponseId(context, response.data.id);
    }
    // Temporary: Capture json output from Stateful API
    // Call immediately after axios.post & ID store (raw response.data pre-type guards).
    await debugWriteRawResponseToFile(response.data, response.data.id ?? 'unknown-response-id');
  } else {
    response = await axios.post(
      url,
      {
        messages: [{ role: "user", content }],
        model,
        stream: false,
        temperature: 0,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );
  }
  return response.data as GrokAPIResponse;
}
 