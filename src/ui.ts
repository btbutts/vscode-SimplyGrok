import * as vscode from "vscode";
import { getSubmitWithEditor } from "./config";

export async function promptForApiKey(): Promise<string> {
  const input = await vscode.window.showInputBox({
    prompt: "Enter your xAI API Key",
    password: true,
    placeHolder: "API Key required",
  });
  return input?.trim() || "";
}

// Question webview editor - input content
function getQuestionEditorContent(): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { 
          margin: 0;
          padding: 20px;
          font-family: var(--vscode-font-family);
          height: 100vh;
          overflow: auto;
          box-sizing: border-box;
        }
        textarea {
          width: 100%;
          height: 400px;
          resize: vertical;
          font-family: var(--vscode-font-family-monospaced);
          font-size: var(--vscode-editor-font-size);
          border: 1px solid var(--vscode-input-border);
          padding: 10px;
          box-sizing: border-box;
        }
        .buttons {
          margin-top: 20px;
          padding-bottom: 30px;
          text-align: center;
        }
        button {
          margin: 0 10px;
          padding: 8px 16px;
          font-size: var(--vscode-font-size);
        }
        h3 {
          margin-bottom: 10px;
        }
      </style>
    </head>
    <body>
      <h3>Enter your question for Grok (multiline supported):</h3>
      <textarea id="question" placeholder="Type your question here... Use Enter for new lines, copy/paste from other tabs, etc."></textarea>
      <div class="buttons">
        <button onclick="submit()">Submit</button>
        <button onclick="cancel()">Cancel</button>
      </div>
      <script>
        const vscode = acquireVsCodeApi();
        function submit() { vscode.postMessage({ command: 'submit', text: document.getElementById('question').value }); }
        function cancel() { vscode.postMessage({ command: 'cancel' }); }
        document.getElementById('question').focus();
      </script>
    </body>
    </html>
  `;
}

// Optional webview editor for question input,
// rather than use Command Palette's input box
// Is user selectable via settings.json
// "vscodeGrok.submitWithEditor"
async function showQuestionEditor(): Promise<string | undefined> {
  return new Promise((resolve) => {
    const panel = vscode.window.createWebviewPanel(
      "grokQuestionInput",
      "Enter Question for Grok",
      vscode.ViewColumn.Beside,
      { enableScripts: true }
    );

    panel.webview.html = getQuestionEditorContent();

    panel.webview.onDidReceiveMessage((message) => {
      switch (message.command) {
        case "submit":
          resolve(message.text);
          panel.dispose();
          break;
        case "cancel":
          resolve(undefined);
          panel.dispose();
          break;
      }
    });

    panel.onDidDispose(() => resolve(undefined));
  });
}

// Will now prompt the user to enter a question,
// either via input box, or webview editor
export async function promptForQuestion(): Promise<string | undefined> {
  const useEditor = await getSubmitWithEditor() ?? false;
  if (useEditor) {
    return await showQuestionEditor();
  }
  const input = await vscode.window.showInputBox({
    prompt: "Enter your question for Grok",
  });
  return input?.trim() || "";
}

export async function showProgress<T>(
  title: string,
  task: () => Promise<T>
): Promise<T> {
  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title,
      cancellable: false,
    },
    task
  );
}
