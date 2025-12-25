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
      <meta charset="UTF-8">
      <title>Grok Question Input</title>
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
          background-color: var(--vscode-input-background);
          color: var(--vscode-input-foreground);
          border: 1px solid var(--vscode-input-border);
          padding: 10px;
          box-sizing: border-box;
        }
        textarea::placeholder {
          color: var(--vscode-input-placeholderForeground);
          opacity: 1;
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
      <textarea
        id="question"
        placeholder="Type your question here...&#10;Use Enter for new lines, copy/paste from other tabs, etc..."
        spellcheck="true"
        autocorrect="on"
        value=""></textarea>
      <div class="buttons">
        <button id="submit-btn">Submit</button>
        <button id="cancel-btn">Cancel</button>
      </div>
      <script>
        'use strict';
        const vscode = acquireVsCodeApi();

        function submit() {
          vscode.postMessage({
            command: 'submit',
            text: document.getElementById('question').value
          });
        }
        
        function cancel() {
          vscode.postMessage({
            command: 'cancel'
          });
        }
        document.getElementById('submit-btn').addEventListener('click', submit);
        document.getElementById('cancel-btn').addEventListener('click', cancel);
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
      {
        enableScripts: true,
        enableFindWidget: true  // Allow user to search within the editor
      }
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
 