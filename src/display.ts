import * as vscode from "vscode";
import { 
  GrokChoices,
  StatefulGrokOutputs
} from "./types";
import {
  OUTPUT_CHANNEL_NAME,
  OUTPUT_METHOD_OUTPUT_CHANNEL,
  OUTPUT_METHOD_TAB,
} from "./const";
import { getOutputMethod } from "./config";

export async function displayResponseInTab(
  choices: GrokChoices
): Promise<void> {
  for (const [index, choice] of choices.entries()) {
    const document = await vscode.workspace.openTextDocument({
      content: `${choice.message.content}`,
      language: "markdown",
    });
    await vscode.window.showTextDocument(document, { preview: false });
  }
  vscode.window.showInformationMessage(
    "Grok finished. Responses shown in new tabs."
  );
}

export function displayResponseInOutputChannel(choices: GrokChoices): void {
  const outputChannel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  outputChannel.clear();
  for (const [index, choice] of choices.entries()) {
    outputChannel.appendLine(choice.message.content);
    outputChannel.appendLine("\n---\n");
  }
  outputChannel.show();
  vscode.window.showInformationMessage(
    "Grok finished. Responses shown in the Output panel."
  );
}

export async function displayResponse(choices: GrokChoices): Promise<void> {
  const outputMethod = await getOutputMethod();
  if (outputMethod === OUTPUT_METHOD_OUTPUT_CHANNEL) {
    displayResponseInOutputChannel(choices);
  } else if (outputMethod === OUTPUT_METHOD_TAB) {
    await displayResponseInTab(choices);
  } else {
    vscode.window.showErrorMessage(
      "Invalid output method set in configuration!"
    );
    throw new Error("Invalid outputMethod");
  }
}


/**
 * Displays Stateful Grok (/v1/responses) responses in either tabs or output channel.
 * Mirrors displayResponse for non-stateful (/v1/chat/completions).
 */
export async function displayStatefulResponseInTab(
  output: StatefulGrokOutputs
): Promise<void> {
  for (const [index, outputItem] of output.entries()) {
    // Skip items without content (e.g., reasoning blocks with only summary: [{text: "...", type: "summary_text"}])
    if (!outputItem.content || !Array.isArray(outputItem.content) || outputItem.content.length === 0) {
      continue;
    }
    // Extract all text blocks from content[] (multi-block safe; join \n\n)
    const texts = outputItem.content
      .map((block) => block.text ?? "")
      .filter((text) => text && text.trim().length > 0)
      .join("\n\n");
    if (!texts.trim()) {
      continue;  // Skip fully empty after filter (no tab for empty)
    }
    const document = await vscode.workspace.openTextDocument({
      content: texts,
      language: "markdown",
    });
    await vscode.window.showTextDocument(document, { preview: false });
  }
  vscode.window.showInformationMessage(
    "Grok finished. Responses shown in new tabs."
  );
}
/**
 * Displays Stateful Grok (/v1/responses) responses in either tabs or output channel.
 */
export function displayStatefulResponseInOutputChannel(output: StatefulGrokOutputs): void {
  const outputChannel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  outputChannel.clear();
  for (const [index, outputItem] of output.entries()) {
    // Skip items without content 
    // e.g., reasoning blocks with only summary:
    // [{text: "...", type: "summary_text"}])
    if (!outputItem.content || !Array.isArray(outputItem.content) || outputItem.content.length === 0) {
      continue;
    }
    // Extract all text blocks from content[] blocks
    // (multi-block safe; join \n\n)
    // It is possible for content to have multiple
    // text blocks (e.g. arrays)
    const texts = outputItem.content
      .map((block) => block.text ?? "")
      .filter((text) => text && text.trim().length > 0)
      .join("\n\n");
    if (!texts.trim()) {
      continue;  // Skip fully empty after filter
    }
    outputChannel.appendLine(texts);
    outputChannel.appendLine("\n---\n");
  }
  outputChannel.show();
  vscode.window.showInformationMessage(
    "Grok finished. Responses shown in the Output panel."
  );
}

export async function displayStatefulResponse(output: StatefulGrokOutputs): Promise<void> {
  const outputMethod = await getOutputMethod();
  if (outputMethod === OUTPUT_METHOD_OUTPUT_CHANNEL) {
    displayStatefulResponseInOutputChannel(output);
  } else if (outputMethod === OUTPUT_METHOD_TAB) {
    await displayStatefulResponseInTab(output);
  } else {
    vscode.window.showErrorMessage(
      "Invalid output method set in configuration!"
    );
    throw new Error("Invalid outputMethod");
  }
}
 