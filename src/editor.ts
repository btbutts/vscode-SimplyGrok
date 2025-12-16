import * as vscode from "vscode";
import * as path from "path";
import { minimatch } from "minimatch";

import { VALID_EXTENSIONS } from "./valid-extensions";
//import { EXCLUDE_LIST } from "./exclude-list";
import { getGitLsFilesOutputAsArray } from "./git";
import { CONFIG_BASE } from "./const";

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

/*function notOnExcludeList(uri: vscode.Uri): boolean {
  const filename = path.basename(uri.path);
  if (!filename) {
    return false;
  }

  return !EXCLUDE_LIST.has(filename);
}*/

export async function readFileAsUtf8(uri: vscode.Uri) {
  const fileContent = await vscode.workspace.fs.readFile(uri);

  // Convert Uint8Array to string with UTF-8 encoding
  return new TextDecoder("utf-8").decode(fileContent);
}

/*export async function getFilesList() {
  const gitFiles = await getGitLsFilesOutputAsArray();
  const config = vscode.workspace.getConfiguration(CONFIG_BASE);
  const excludeFiles: string[] = config.get("excludeFiles", ["package-lock.json"]);
  const excludeSet = new Set(excludeFiles.map(f => f.toLowerCase()));
  return gitFiles
    .filter(isValidExtension)
    .filter(notOnExcludeList)
    .filter((uri): boolean => {
      const filename = path.basename(uri.path).toLowerCase();
      return !excludeSet.has(filename);
    });
}*/
/*
export async function getFilesList(): Promise<vscode.Uri[]> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showWarningMessage("No workspace folder open.");
    return [];
  }

  const gitFiles = await getGitLsFilesOutputAsArray();
  const config = vscode.workspace.getConfiguration(CONFIG_BASE);
  const excludeFiles: string[] = config.get("excludeFiles", [
    "node_modules",
    ".git",
    "dist",
    "out",
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    ".log",
    ".gitignore"
  ]);
  const excludeSet = new Set(excludeFiles.map(f => f.toLowerCase()));

  return gitFiles
    .filter(isValidExtension)
    .filter(uri => !shouldExclude(uri, workspaceFolder, excludeSet));
}*/

// Replace the existing `getFilesList` function with this:
export async function getFilesList(): Promise<vscode.Uri[]> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showWarningMessage("No workspace folder open.");
    return [];
  }

  const gitFiles = await getGitLsFilesOutputAsArray();
  const config = vscode.workspace.getConfiguration(CONFIG_BASE);
  const excludeList: string[] = config.get("excludeFiles", [
    "node_modules",
    ".git",
    "dist",
    "out",
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    ".log",
    ".gitignore"
  ]);

  return gitFiles
    .filter(isValidExtension)
    .filter(uri => !shouldExclude(uri, workspaceFolder, excludeList));
}

// wildcard helper function
function hasWildcard(pattern: string): boolean {
  return /[*?[{}]/.test(pattern) || pattern.includes("**");
}

// Replace the existing `shouldExclude` function with this:
function shouldExclude(
  uri: vscode.Uri, 
  workspaceFolder: vscode.WorkspaceFolder, 
  excludeList: string[]
): boolean {
  // Get relative path from workspace root (cross-platform safe)
  let relPath = path.relative(workspaceFolder.uri.fsPath, uri.fsPath);
  if (!relPath || relPath === '.') {
    return false;
  }

  // Normalize path separators and split into segments
  relPath = path.normalize(relPath);
  const segments = relPath.split(path.sep).filter(s => s.length > 0);
  if (segments.length === 0) {
    return false;
  }

  const filename = segments[segments.length - 1].toLowerCase();

  // Handle exact matches (backward compatible)
  const exactPatterns = excludeList.filter(p => !hasWildcard(p));
  const exactSet = new Set(exactPatterns.map(p => p.toLowerCase()));
  if (exactSet.has(filename)) {
    return true;
  }
  // Exclude if any parent directory basename matches
  for (let i = 0; i < segments.length - 1; i++) {
    if (exactSet.has(segments[i].toLowerCase())) {
      return true;
    }
  }

  // Handle glob/wildcard patterns (VSCode glob format support)
  const globPatterns = excludeList.filter(p => hasWildcard(p));
  if (globPatterns.length === 0) {
    return false;
  }

  // Normalize to POSIX path for glob matching (VSCode globs expect /)
  const posixRelPath = relPath.split(path.sep).join('/');
  
  // Case-insensitive matching to match existing behavior
  for (const pattern of globPatterns) {
    if (minimatch(posixRelPath, pattern, { nocase: true })) {
      return true;
    }
  }

  return false;
}

/*
function shouldExclude(
  uri: vscode.Uri, 
  workspaceFolder: vscode.WorkspaceFolder, 
  excludeSet: Set<string>
): boolean {
  // Get relative path from workspace root (cross-platform safe)
  let relPath = path.relative(workspaceFolder.uri.fsPath, uri.fsPath);
  if (!relPath || relPath === '.') {
    return false;
  }

  // Normalize path separators and split into segments
  relPath = path.normalize(relPath);
  const segments = relPath.split(path.sep).filter(s => s.length > 0);
  if (segments.length === 0) {
    return false;
  }

  const filename = segments[segments.length - 1].toLowerCase();

  // Exclude if filename matches
  if (excludeSet.has(filename)) {
    return true;
  }

  // Exclude if any parent directory basename matches
  for (let i = 0; i < segments.length - 1; i++) {
    if (excludeSet.has(segments[i].toLowerCase())) {
      return true;
    }
  }

  return false;
}
*/

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
