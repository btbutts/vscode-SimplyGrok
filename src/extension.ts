import * as vscode from "vscode";
import { sendToGrok } from "./api";
import { prepareContext, prepareWorkspaceContext } from "./context";
import { displayResponse } from "./display";
import { getMessage } from "./message";
import { handleGrokPreview } from "./preview";
import { MessageType } from "./types";
import { showProgress } from "./ui";

async function handleSendToGrok(
  apiKey: string,
  model: string,
  prompt: string,
  stateful: boolean
): Promise<void> {
  const response = await showProgress("Grok is thinking...", () =>
    sendToGrok(apiKey, model, prompt, stateful)
  );

  if (!response || !response.choices || !response.choices.length) {
    vscode.window.showErrorMessage("No valid response from Grok.");
    return;
  }

  await displayResponse(response.choices);
}

async function handleAskGrok(type: MessageType): Promise<void> {
  try {
    const context =
      type === "workspace"
        ? await prepareWorkspaceContext()
        : await prepareContext();
    if (!context) {
      return;
    }

    const prompt = await getMessage(type, context.question);
    if (!prompt) {
      return;
    }

    if (!(await handleGrokPreview(type, prompt))) {
      return;
    }

    await handleSendToGrok(context.apiKey, context.model, prompt, context.stateful);
  } catch (error) {
    console.error(error);
  }
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("vscode-grok.askGrokWorkspace", () =>
      handleAskGrok("workspace")
    ),
    vscode.commands.registerCommand("vscode-grok.askGrokTab", () =>
      handleAskGrok("tab")
    ),
    vscode.commands.registerCommand("vscode-grok.askGrokFunction", () =>
      handleAskGrok("function")
    ),
    vscode.commands.registerCommand("vscode-grok.askGrokSelection", () =>
      handleAskGrok("selection")
    )
  );
}
