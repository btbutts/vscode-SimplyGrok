import fs from 'fs-extra';
import path from 'path';
import axios from 'axios';
import util from 'util';
import { exec } from 'child_process';

const execAsync = util.promisify(exec);

// Standalone async copy script for Typo.js assets.
// Copies typo.js lib and en_US dictionary to resources/lib/
// Called from npm run compile/package
// Dynamically copies all dictionaries from node_modules/typo-js/dictionaries/**/
// Each dictionary folder (e.g., en_US, en_GB-ise, en_CA, etc.) is recreated under resources/lib/dictionaries/
// with its matching .aff and .dic files (or any en_XX.* files if naming changes).
// Idempotent, creates directories as needed.
// No-op if node_modules/typo-js missing (build guard).

async function copyTypoAssets() {
  const srcBase = path.join('node_modules', 'typo-js');
  const destLib = path.join('resources', 'lib', 'typo-js');
  const destDictBase = path.join(destLib, 'dictionaries');

  try {
    // Ensure base directories exist
    await fs.ensureDir(destLib);
    await fs.ensureDir(destDictBase);

    // ------------------------------------------------------------
    // 1. Copy the main typo.js library file
    // ------------------------------------------------------------
    // Preferred location in newer versions: root of package
    let typoLibSrc = path.join(srcBase, 'typo.js');
    let useRoot = false;

    // Check if the root version exists; if not, fall back to lib/typo.js
    if (await fs.pathExists(typoLibSrc)) {
      useRoot = true;
    } else {
      typoLibSrc = path.join(srcBase, 'lib', 'typo.js');
      // If neither exists, we'll let fs.copy throw – that's a missing dependency
    }

    const typoLibDest = path.join(destLib, 'typo.js');
    await fs.copy(typoLibSrc, typoLibDest);

    console.log(`Typo.js library copied from
      ${useRoot
        ? 'node_modules/typo-js'
        : 'node_modules/typo-js/lib/'
      } to resources/lib/typo.js`
    );

    // ------------------------------------------------------------
    // 2. Ensure required large Hunspell dictionaries (.aff/.dic) in media/dicts/
    // ------------------------------------------------------------
    // Downloads/builds only if dir missing or files incomplete (idempotent).
    // Specific large dicts: en_AU-large, en_US-large, en_CA-large, en_GB-large.
    // Extracts hunspell-*-YYYY dir, renames/moves files to media/dicts/<name>/.
    // Platform-safe unzip (powershell/unzip); async/non-blocking.
    // After prep, Step 2 builds typo-index.js from them for Typo.js.
    const requiredLargeDicts = [
      {
        name: 'en_AU-large',
        url: 'https://altushost-swe.dl.sourceforge.net/project/wordlist/speller/2020.12.07/hunspell-en_AU-large-2020.12.07.zip?viasf=1'
      },
      {
        name: 'en_US-large',
        url: 'https://altushost-swe.dl.sourceforge.net/project/wordlist/speller/2020.12.07/hunspell-en_US-large-2020.12.07.zip?viasf=1'
      },
      {
        name: 'en_US',
        url: 'https://altushost-swe.dl.sourceforge.net/project/wordlist/speller/2020.12.07/hunspell-en_US-2020.12.07.zip?viasf=1'
      },
      {
        name: 'en_CA-large',
        url: 'https://altushost-swe.dl.sourceforge.net/project/wordlist/speller/2020.12.07/hunspell-en_CA-large-2020.12.07.zip?viasf=1'
      },
      {
        name: 'en_GB-large',
        url: 'https://altushost-swe.dl.sourceforge.net/project/wordlist/speller/2020.12.07/hunspell-en_GB-large-2020.12.07.zip?viasf=1'
      }
    ];

    const sourceMediaDictsDir = path.join('media', 'dicts');
    await fs.ensureDir(sourceMediaDictsDir);

    // For loop cycles through requiredLargeDicts
    // array to process each dictionary
    for (const { name, url } of requiredLargeDicts) {
      // Target Paths of .aff/.dic files
      const targetLibDictsDir = path.join('resources', 'lib', 'typo-js', 'dictionaries');
      const uniqueDictDir = path.join(targetLibDictsDir, name);
      const affFile = path.join(uniqueDictDir, `${name}.aff`);
      const dicFile = path.join(uniqueDictDir, `${name}.dic`);
      // Validate the target dict paths exist
      const dirExists = await fs.pathExists(uniqueDictDir);
      const affExists = await fs.pathExists(affFile);
      const dicExists = await fs.pathExists(dicFile);
      // If any are mssing, download/extract/move to target
      // path in resources/lib/typo-js/dictionaries/
      if (!dirExists || !affExists || !dicExists) {
        console.log(`Preparing large dictionary ${name} (downloading/extracting)...`);

        // Download dict zip file and write to temp location
        const zipFile = path.join(sourceMediaDictsDir, `${name}.zip`);
        await (
          await fs.pathExists(zipFile)
            ? Promise.resolve(null)
            : (async () => {          // Download only if missing
              console.log(`Downloading ${name} from:\n${url}...`);
              const { data: zipBuffer } = await axios.get(url, { responseType: 'arraybuffer' });
              await fs.writeFile(zipFile, Buffer.from(zipBuffer));
              console.log(`Downloaded and saved ${zipFile}`);
            })()
        );
        // Temp extract dir (cleanup first)
        const tempExtractDir = path.join(sourceMediaDictsDir, `temp_extract_${name}`);
        await fs.remove(tempExtractDir).catch(() => {});  // Ignore if missing
        await fs.ensureDir(tempExtractDir);

        // Platform-specific unzip (async execAsync)
        const zipPathEsc = zipFile.replace(/'/g, "''");
        const tempEsc = tempExtractDir.replace(/'/g, "''");
        const unzipCmd = process.platform === 'win32'
          ? `powershell -Command "Expand-Archive -Path '${zipPathEsc}' -DestinationPath '${tempEsc}' -Force"`
          : `unzip -o "${zipFile}" -d "${tempExtractDir}"`;

        const { stdout: unzipStdout, stderr: unzipStderr } = await execAsync(unzipCmd);
        if (unzipStderr && !unzipStderr.includes('already exists')) {
          throw new Error(`Unzip failed for ${name}: ${unzipStderr}`);
        }

        // Ensure target dict dir
        await fs.ensureDir(uniqueDictDir);

        // Move .aff/.dic (overwrite)
        const srcAff = path.join(tempExtractDir, `${name}.aff`);
        const srcDic = path.join(tempExtractDir, `${name}.dic`);

        // Validate extracted files exist before moving
        if (await fs.pathExists(srcAff)) {
          await fs.move(srcAff, affFile, { overwrite: true });
        } else {
          throw new Error(`Missing ${name}.aff after extract`);
        }

        if (await fs.pathExists(srcDic)) {
          await fs.move(srcDic, dicFile, { overwrite: true });
        } else {
          throw new Error(`Missing ${name}.dic after extract`);
        }

        // Cleanup
        await fs.remove(tempExtractDir);
        //await fs.remove(zipFile);

        console.log(`${name} large dictionary prepared successfully in resources/lib/typo-js/dictionaries/${name}/`);
      } else {
        console.log(`${name} large dictionary already complete in resources/lib/typo-js/dictionaries/${name}/`);
      }
    }

    // ------------------------------------------------------------
    // 3a. Copy prebuilt JS dictionaries from node_modules/typo-js/dictionaries/* (dynamic)
    // ------------------------------------------------------------
    const typoJSdictSrcDir = path.join(srcBase, 'dictionaries');

    if (await fs.pathExists(typoJSdictSrcDir)) {
      const dictFolders = await fs.readdir(typoJSdictSrcDir, { withFileTypes: true });
      const folderNames = dictFolders
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      if (folderNames.length === 0) {
        console.warn('No dictionary folders found under node_modules/typo-js/dictionaries/.');
      }

      for (const folderName of folderNames) {
        const srcFolder = path.join(typoJSdictSrcDir, folderName);
        const destFolder = path.join(destDictBase, folderName);

        await fs.ensureDir(destFolder);

        // Copy entire folder (all files: typo-index.js etc.)
        await fs.copy(srcFolder, destFolder, { overwrite: true });

        console.log(`\nCopied prebuilt dictionary folder ${folderName} to resources/lib/dictionaries/${folderName}/`);
      }
    } else {
      console.warn('No dictionaries directory found in typo-js. Skipping prebuilt copy.');
    }

    // ------------------------------------------------------------
    // 3b. Build JS dictionaries from media/dicts/* Hunspell .aff/.dic (dynamic)
    // ------------------------------------------------------------
    // Discovers ALL valid dirs dynamically (readdir + validate .aff/.dic match dir name).
    // Runs typo-js/tools/build-dictionary.js <lang> <aff> <dic> → stdout → typo-index.js.
    // Merges with prebuilt (no dupes assumed; -large differs from base en_US).
    if (await fs.pathExists(sourceMediaDictsDir)) {
      const mediaFolders = await fs.readdir(sourceMediaDictsDir, { withFileTypes: true });
      const validMediaFolders = mediaFolders
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      if (validMediaFolders.length === 0) {
        console.warn('No dictionary folders found under media/dicts/.');
      }

      const buildToolPath = path.join(srcBase, 'tools', 'build-dictionary.js');
      if (!(await fs.pathExists(buildToolPath))) {
        console.warn(`Typo.js build tool missing: ${buildToolPath}.\n → Skipping Hunspell builds (prebuilt only).`);
      } else {
        for (const folderName of validMediaFolders) {
          const affPath = path.join(sourceMediaDictsDir, folderName, `${folderName}.aff`);
          const dicPath = path.join(sourceMediaDictsDir, folderName, `${folderName}.dic`);

          const affExists = await fs.pathExists(affPath);
          const dicExists = await fs.pathExists(dicPath);

          if (affExists && dicExists) {
            const destFolder = path.join(destDictBase, folderName);
            await fs.ensureDir(destFolder);

            // Build cmd: node tools/build-dictionary.js <lang> <aff> <dic> (stdout = JS)
            const resolvedAff = path.resolve(affPath);
            const resolvedDic = path.resolve(dicPath);
            const buildCmd = `node "${path.resolve(buildToolPath)}" "${folderName}" "${resolvedAff}" "${resolvedDic}"`;

            // Async exec + capture stdout → write typo-index.js
            const { stdout: jsOutput, stderr: buildStderr } = await execAsync(buildCmd);
            if (buildStderr) {
              console.warn(`Build warning for ${folderName}: ${buildStderr}`);
            }

            const indexJsPath = path.join(destFolder, 'typo-index.js');
            await fs.writeFile(indexJsPath, jsOutput, 'utf8');

            console.log(`Built typo-index.js for ${folderName} from media/dicts/${folderName}/.aff/.dic`);
          } else {
            console.warn(`Skipping ${folderName}: missing ${folderName}.aff or ${folderName}.dic`);
          }
        }
      }
    } else {
      console.warn('media/dicts/ not found. Skipping Hunspell builds.');
    }

    console.log('\nTypo.js assets (library + all dictionaries) copied successfully!\n');
  } catch (error) {
    console.error('Failed to copy Typo.js assets:', error);
    process.exit(1); // Fail the build if something critical is missing
  }
}

copyTypoAssets();