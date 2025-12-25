import * as vscode from "vscode";
import { sendToGrok } from "./api";
import { 
  prepareContextWithoutQuestion, 
  prepareWorkspaceContextWithoutQuestion, 
  ensureQuestion,
  initGrokLastResponseIDparam
} from "./context";
import { displayResponse, displayStatefulResponse } from "./display";
import { 
  getActiveTab,
  getActiveFunctionText,
  getSelectedText
} from "./editor";
import { getWorkspaceRawContent, buildPrompt } from "./message";
import { handleGrokPreview } from "./preview";
import { 
  MessageType,
  GrokAPIResponse,
  isChatCompletionResponse,
  isStatefulAPIResponse
} from "./types";
import { showProgress } from "./ui";

async function handleSendToGrok(
  apiKey: string,
  model: string,
  prompt: string,
  stateful: boolean
): Promise<void> {
  const response: GrokAPIResponse = await showProgress("Grok is thinking...", () =>
    sendToGrok(apiKey, model, prompt, stateful)
  );

  // Validation + narrowing of non-stateful vs stateful response structure via type guards
  // responses.choices corresponds to /v1/chat/completions endpoint
  // responses.output corresponds to /v1/responses (stateful) endpoint
  if (stateful) {
    if (isStatefulAPIResponse(response)) {
      // TS narrows to StatefulApiResponse: response.output is StatefulGrokOutputs
      await displayStatefulResponse(response.output);
    } else {
      vscode.window.showErrorMessage("No valid response from Grok Stateful API.");
      return;
    }
  } else {
    if (isChatCompletionResponse(response)) {
      // TS narrows to ChatCompletionResponse: response.choices is GrokChoices
      await displayResponse(response.choices);
    } else {
      vscode.window.showErrorMessage("No valid response from Grok.");
      return;
    }
  }
}

async function handleAskGrok(type: MessageType): Promise<void> {
  try {
    let rawContent: string;
    if (type === "workspace") {
      rawContent = await getWorkspaceRawContent();
    } else {
      switch (type) {
        case "tab": {
          const tab = getActiveTab();
          rawContent = `${tab.path}\n${tab.content}`;
          break;
        }
        case "function": {
          rawContent = await getActiveFunctionText();
          break;
        }
        case "selection": {
          rawContent = await getSelectedText();
          break;
        }
        default:
          return;
      }
    }

    const context =
      type === "workspace"
        ? await prepareWorkspaceContextWithoutQuestion()
        : await prepareContextWithoutQuestion();

    const question = await ensureQuestion();
    if (!question) {
      return;
    }

    // If stateful and lastResponseId not initialized,
    // proactively create it in workspace settings.json.
    if (context.stateful) {
      await initGrokLastResponseIDparam(context.stateful);
    }

    const prompt = buildPrompt(type, rawContent, question);
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

// Set Status Bar Icon State - Using Codicons 
let statusBarItem: vscode.StatusBarItem | undefined;
let tempIconTimeout: NodeJS.Timeout | undefined;
const STATUS_TEXT = {
  on: '$(hubot) Grok - Stateful ON',     // Default hubot + text (green when ON).
  off: '$(hubot) Grok - Stateful OFF'    // Default hubot + text (white/black theme default).
} as const;

// Temporary state flag prevents updateStatusBar 
// from interfering during 10s temp animation.
// Set true in toggleStatefulAPI
// (blocks config/theme resets → no hubot flash).
let tempActive: boolean = false;

// Update status bar icon/text based on theme, stateful value, and temp state.
// Called on activate, config/theme changes, temp timeout.
async function updateStatusBar(context: vscode.ExtensionContext): Promise<void> {
  if (!statusBarItem) {
    return;
  }

  // Skip during tempActive
  // Blocks premature reset from config/theme events E.G. no hubot flash
  if (tempActive) {
    return;
  }

  const config = vscode.workspace.getConfiguration('vscodeGrok');
  const isStateful = config.get<boolean>('enableStatefulSessions') ?? false;
  const themeKind = vscode.window.activeColorTheme.kind;

  // Text: Codicon + status (hubot default; temp override in toggle).
  statusBarItem.text = isStateful ? STATUS_TEXT.on : STATUS_TEXT.off;

  // Markdown Tooltip (bold ON/OFF, <br> lines).
  statusBarItem.tooltip = new vscode.MarkdownString(
    '### Click to toggle Grok stateful responses On/Off!  \n\n' +
    '  * When stateful sessions are **ON**, Grok retains  \n' +
    'context across multiple interactions, allowing for  \n' +
    'more coherent and context-aware responses.  \n' +
    '  * When **OFF**, each interaction is treated  \n' +
    'independently.'
  );

  // Temp color? Clear timeout and use primary (handled in toggle)
  if (tempIconTimeout) {
    clearTimeout(tempIconTimeout);
    tempIconTimeout = undefined;
  }

  // Color: Whole-item (icon+text). Theme default OFF (uses statusBar.foreground ThemeColor from current theme).
  // ON: Permanent green. No iconPath (Codicons only).
  const defaultThemeColor: vscode.ThemeColor = new vscode.ThemeColor('statusBar.foreground');
  let onStatusColor: string;
  if (themeKind === vscode.ColorThemeKind.Light) {
    onStatusColor = '#216e00ff';  // Darker-Green text/icon on light theme.
  } else {
    onStatusColor = '#2DBD19';  // Lighter-Green text/icon on dark/highcontrast.
  }
  statusBarItem.color = isStateful ? onStatusColor : defaultThemeColor;  // Green ON, theme OFF.

  statusBarItem.command = 'vscode-grok.toggleStatefulAPI';  // Click handler.
  statusBarItem.show();  // Ensures visible (priority 100, right-aligned).
}

// Toggle stateful, temp icon (green/red 10s), revert. Triggers config change → updateStatusBar.
async function toggleStatefulAPI(context: vscode.ExtensionContext): Promise<void> {
  const config = vscode.workspace.getConfiguration('vscodeGrok');
  const current = config.get<boolean>('enableStatefulSessions') ?? false;
  
  // Target: Workspace if open (matches lastResponseId); fallback Global.
  const target = vscode.workspace.workspaceFolders?.length 
    ? vscode.ConfigurationTarget.Workspace 
    : vscode.ConfigurationTarget.Global;
  await config.update('enableStatefulSessions', !current, target);

  const isNowOn = !current; // New state post-toggle.

  // Block updateStatusBar during temp
  // prevents config listener flash
  tempActive = true;

  // Step 1: Instant color change (fade sim start).
  let onStatusColor: string;
  let offStatusColor: string;
  const themeKind = vscode.window.activeColorTheme.kind;
  if (themeKind === vscode.ColorThemeKind.Light) {
    onStatusColor = '#216e00ff';  // Darker-Green text/icon on light theme.
    offStatusColor = '#b56c00ff'; // Dark-Amber text/icon on light theme.
  } else {
    onStatusColor = '#2DBD19';  // Lighter-Green text/icon on dark/highcontrast.
    offStatusColor = '#e68005'; // Amber text/icon on dark/highcontrast.
  }
  statusBarItem!.color = isNowOn ? onStatusColor : offStatusColor;  // Green ON temp, amber OFF temp.

  // Step 2: 250ms delay → icon/text change (total 500ms "fade" effect; native limit).
  setTimeout(() => {
    // Temp text: Override hubot with temp Codicon.
    const tempText = isNowOn 
      ? '$(comment-discussion-quote) Grok - Stateful ON' 
      : '$(comment) Grok - Stateful OFF';
    statusBarItem!.text = tempText;
  }, 250);

  // Step 3: Full 10s timeout → revert to updateStatusBar (permanent state + hubot + color).
  tempIconTimeout = setTimeout(async () => {
    // Unblock before refresh (allows config/theme post-10s).
    tempActive = false;
    await updateStatusBar(context);  // Resets hubot/text/color
  }, 10000);
}

export function activate(context: vscode.ExtensionContext) {
  // Create status bar item (isolated; always visible)
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  context.subscriptions.push(statusBarItem);

  // Initial update
  updateStatusBar(context);

  // Monitor for config changes (stateful toggle via settings/button)
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration('vscodeGrok.enableStatefulSessions')) {
        await updateStatusBar(context);
      }
    })
  );

  // Monitor for theme changes (dark/light icon swap)
  context.subscriptions.push(
    vscode.window.onDidChangeActiveColorTheme(async () => {
      await updateStatusBar(context);
    })
  );

  // Toggle handler - controls status of vscodeGrok.enableStatefulSessions
  context.subscriptions.push(
    vscode.commands.registerCommand('vscode-grok.toggleStatefulAPI', async () => {
      await toggleStatefulAPI(context);
    })
  );

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

export function deactivate() {}