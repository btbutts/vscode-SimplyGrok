import * as vscode from "vscode";
import * as path from "path";
import { minimatch } from "minimatch";

import { VALID_EXTENSIONS } from "./valid-extensions";
import { EXCLUDE_LIST } from "./exclude-list";
import { getGitLsFilesOutputAsArray } from "./git";

export function isValidExtension(uri: vscode.Uri): boolean {
  const filename = path.basename(uri.path);
  if (!filename) {
    return false; // Empty filename is invalid
  }

  // Special cases: no extension or dot files
  if (!filename.includes(".")) {
    return true; // e.g., "README"
  }
  if (filename.startsWith(".")) {
    return true; // e.g., ".gitignore"
  }

  // Extract extension
  const extension = path.extname(filename).toLowerCase();
  if (!extension) {
    return false;
  }

  return VALID_EXTENSIONS.has(extension);
}

/* Legacy: notOnExcludeList is unused — commented out for removal/cleanup.
// Legacy function: only checks hardcoded exclude list
// package-lock.json from extension building
// Replaced with shouldIncludeFile below
function notOnExcludeList(uri: vscode.Uri): boolean {
  const filename = path.basename(uri.path);
  if (!filename) {
    return false;
  }

  return !EXCLUDE_LIST.has(filename);
}
*/

export function shouldIncludeFile(uri: vscode.Uri, workspaceRoot: string): boolean {
  // Step 1: Preserve original hardcoded exclusion (exact basename match, anywhere)
  const filename = path.basename(uri.path);
  if (EXCLUDE_LIST.has(filename)) {
    return false;
  }

  // Step 2: Compute relative path from workspace root (normalize to / for minimatch)
  const relativePath = path.relative(workspaceRoot, uri.path).replace(/\\/g, '/');

  // Step 3: Get user configs (merged workspace/user settings
  // includeFiles shall have no defaults here [] but,
  // excludeFiles may have defaults in package.json,
  // each of which may be overridden by end-user.)
  const config = vscode.workspace.getConfiguration('vscodeGrok');
  const excludePatterns: string[] = config.get<string[]>('excludeFiles', []);
  const includePatterns: string[] = config.get<string[]>('includeFiles', []);

  // Step 4: Check excludes (minimatch full-path glob)
  let excluded = false;
  for (const pattern of excludePatterns) {
    if (minimatch(relativePath, pattern)) {
      excluded = true;
      break;
    }
  }

  // Step 5: If file/dir is not excluded, include
  if (!excluded) {
    return true;
  }

  // Step 6: If file/dir is excluded, override with any
  // user-defined includes (includes shall have stronger weight)
  for (const pattern of includePatterns) {
    if (minimatch(relativePath, pattern)) {
      return true;
    }
  }

  // Step 7: If file/dir is excluded and not included, we exclude
  return false;
}

export async function readFileAsUtf8(uri: vscode.Uri) {
  const fileContent = await vscode.workspace.fs.readFile(uri);

  // Convert Uint8Array to string with UTF-8 encoding
  return new TextDecoder("utf-8").decode(fileContent);
}

// Reworked getFilesList to use new shouldIncludeFile function
// such that user-defined include/exclude patterns are respected
// along with hard-coded exclude list from package-lock.json
export async function getFilesList() {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showErrorMessage(
      "No workspace folder open!\n"
      + "Please open a Workspace or add a folder it\n"
      + "to run the Workspace mode of SimplyGrok"
    );
    throw new Error("No workspace is open");
  }
  const workspaceFolder = workspaceFolders[0];
  const workspaceRoot = workspaceFolder.uri.fsPath;

  // Allow for overriding files excluded by .gitignore by permitting
  // user to specify additional files/globs via includeFiles in settings
  // Step 1: Get git-tracked/unignored files (original core logic)
  const gitFiles = await getGitLsFilesOutputAsArray();
  const filteredGitFiles = gitFiles
    .filter(isValidExtension)
    .filter((uri) => shouldIncludeFile(uri, workspaceRoot));

  // Step 2: Get additional files matching user's defined
  // includeFiles globs. We will override gitignores
  const additionalFilesSet = new Set<string>(); // Dedupe by fsPath
  filteredGitFiles.forEach(uri => additionalFilesSet.add(uri.fsPath)); // Pre-add git files to avoid doubles

  const config = vscode.workspace.getConfiguration('vscodeGrok');
  const includePatterns: string[] = config.get<string[]>('includeFiles', []);
  const additionalFiles: vscode.Uri[] = [];
  for (const pattern of includePatterns) {
    // vscode.workspace.findFiles(pattern, undefined) finds ALL matching files
    // (ignores gitignores, no exclude glob needed here)
    // { maxResults: 1000 } to limit explosion from broad globs like "**"
    const foundFiles = await vscode.workspace.findFiles(pattern, undefined, 1000);
    for (const uri of foundFiles) {
      if (isValidExtension(uri) && shouldIncludeFile(uri, workspaceRoot)) {
        if (!additionalFilesSet.has(uri.fsPath)) {
          additionalFilesSet.add(uri.fsPath);
          additionalFiles.push(uri);
        }
      }
    }
  }

  // Step 3: Combine (git first, then additional)
  return [...filteredGitFiles, ...additionalFiles];
}

export function getActiveTab() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage("No active tab found!");
    throw new Error("No editor");
  }
  const path = editor.document.uri.path;
  const content = editor.document.getText();
  if (!content) {
    vscode.window.showErrorMessage("Active tab appears to be empty!");
    throw new Error("Empty tab");
  }
  return { path, content };
}

export async function getActiveFunctionText(): Promise<string> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage("No active tab found!");
    throw new Error("No editor");
  }
  const document = editor.document;
  const position = editor.selection.active;
  const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
    "vscode.executeDocumentSymbolProvider",
    document.uri
  );
  if (!symbols || symbols.length === 0) {
    vscode.window.showErrorMessage("No symbols found!");
    throw new Error("No symbols");
  }
  const activeFunction = findContainingFunction(symbols, position);
  if (!activeFunction) {
    vscode.window.showErrorMessage("Unable to determine function!");
    throw new Error("No function");
  }
  return document.getText(activeFunction.range);
}

export function findContainingFunction(
  symbols: vscode.DocumentSymbol[],
  position: vscode.Position
): vscode.DocumentSymbol | undefined {
  for (const symbol of symbols) {
    if (
      symbol.kind === vscode.SymbolKind.Function ||
      symbol.kind === vscode.SymbolKind.Method
    ) {
      if (symbol.range.contains(position)) {
        return symbol;
      }
    }
    if (symbol.children?.length) {
      const childResult = findContainingFunction(symbol.children, position);
      if (childResult) {
        return childResult;
      }
    }
  }
}

export async function getSelectedText() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage("No active tab found!");
    throw new Error("No editor");
  }

  const selection = editor.selection;
  if (!selection) {
    vscode.window.showErrorMessage("No selection available!");
    throw new Error("No selection");
  }

  const selectedText = editor.document.getText(selection);
  if (!selectedText) {
    vscode.window.showErrorMessage("No selected text found!");
    throw new Error("No selected text");
  }

  return selectedText;
}
