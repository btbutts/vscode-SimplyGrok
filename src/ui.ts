import * as vscode from "vscode";
import { getSubmitWithEditor } from "./config";
import { QuestionEditorLoadError } from "./types";

export async function promptForApiKey(): Promise<string> {
  const input = await vscode.window.showInputBox({
    prompt: "Enter your xAI API Key",
    password: true,
    placeHolder: "API Key required",
  });
  return input?.trim() || "";
}

// Question webview editor - input content
/*function getQuestionEditorContent(): string {
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
        #question {
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
          white-space: pre-wrap;
          word-wrap: break-word;
          overflow: auto;
        }
        #question.placeholder {
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
      <div
        id="question"
        contenteditable="true"
        spellcheck="true"
        autocorrect="on"
        autocapitalize="off"></div>
      <div class="buttons">
        <button id="submit-btn">Submit</button>
        <button id="cancel-btn">Cancel</button>
      </div>
      <script>
        'use strict';
        const vscode = acquireVsCodeApi();
        const question = document.getElementById('question');
        const placeholderText = "Type your question here...&#10;Use Enter for new lines, copy/paste from other tabs, etc...";

        // Set initial placeholder
        question.innerText = placeholderText;
        question.classList.add('placeholder');

        question.addEventListener('focus', function() {
          if (question.classList.contains('placeholder')) {
            question.classList.remove('placeholder');
            question.innerText = '';
          }
        });

        question.addEventListener('blur', function() {
          if (question.innerText.trim() === '') {
            question.classList.add('placeholder');
            question.innerText = placeholderText;
          }
        });

        // Ensure placeholder class is removed on input/paste/etc.
        question.addEventListener('input', function() {
          question.classList.remove('placeholder');
        });

        function submit() {
          let text = '';
          if (!question.classList.contains('placeholder')) {
            text = question.innerText;
          }
          vscode.postMessage({
            command: 'submit',
            text: text
          });
        }
        
        function cancel() {
          vscode.postMessage({
            command: 'cancel'
          });
        }
        document.getElementById('submit-btn').addEventListener('click', submit);
        document.getElementById('cancel-btn').addEventListener('click', cancel);
        document.focus();
      </script>
    </body>
    </html>
  `;
}
*/

async function getQuestionEditorContent(context: vscode.ExtensionContext): Promise<string> {
  try {
    // Path matches provided file: /resources/media/questionEditor.html relative to extension root
    const htmlUri = vscode.Uri.joinPath(context.extensionUri, 'resources', 'media', 'questionEditor.html');
    const htmlContent = await vscode.workspace.fs.readFile(htmlUri);
    // Convert Uint8Array to UTF-8 string (consistent with readFileAsUtf8 in src/editor.ts; async/non-blocking)
    return Buffer.from(htmlContent).toString("utf-8");
  } catch (error) {
    // Instantiate custom error with original as cause (chainable; instanceof safe)
    const loadError = new QuestionEditorLoadError(
      'Failed to find or load question editor HTML',
      error as Error
    );
    console.error('Failed to find or load question editor HTML:', loadError);
    // Re-throw the original error so callers can handle it
    throw loadError;
  }
}

// Optional webview editor for question input,
// rather than use Command Palette's input box
// Is user selectable via settings.json
// "vscodeGrok.submitWithEditor"
async function showQuestionEditor(context: vscode.ExtensionContext): Promise<string | undefined> {
  return new Promise((resolve) => {
    const panel = vscode.window.createWebviewPanel(
      "grokQuestionInput",
      "Enter Question for Grok",
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        enableFindWidget: true,  // Allow user to search within the editor
        localResourceRoots: [vscode.Uri.file(context.extensionPath)]
      }
    );

    // Await the async HTML load (non-blocking)
    getQuestionEditorContent(context).then((htmlContent) => {
      panel.webview.html = htmlContent;
      // Generate unique sessionId for this webview instance to isolate sessionStorage key
      // Ensures drafts do not persist across new webview tabs/sessions (cancel/close/X)
      const sessionId = `grokq-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      panel.webview.postMessage({
        command: 'setSessionId',
        sessionId: sessionId
      });
    }).catch((error) => {
      console.error('Failed to set webview HTML:', error);
      resolve(undefined);
    });

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
export async function promptForQuestion(context: vscode.ExtensionContext): Promise<string | undefined> {
  const useEditor = await getSubmitWithEditor() ?? false;
  if (useEditor) {
    return await showQuestionEditor(context);
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
 