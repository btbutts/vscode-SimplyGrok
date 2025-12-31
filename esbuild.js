const esbuild = require("esbuild");
const fsExtra = require('fs-extra');
const path = require('path');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',

	setup(build) {
		build.onStart(() => {
			console.log('[watch] build started');
		});
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				console.error(`    ${location.file}:${location.line}:${location.column}:`);
			});

			if (result.errors.length === 0) {
				copyAssets();  // Copy html on successful build/end
			}
			console.log('[watch] build finished');
		});
	},
};

async function main() {
	const ctx = await esbuild.context({
		entryPoints: [
			'src/extension.ts'
		],
		bundle: true,
		format: 'cjs',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'node',
		outfile: 'dist/extension.js',
		external: ['vscode'],
		logLevel: 'silent',
		plugins: [
			/* add to the end of plugins array */
			esbuildProblemMatcherPlugin,
		],
	});

	// Perform initial build (triggers plugin onStart/onEnd)
	const initialResult = await ctx.rebuild();
	if (initialResult.errors.length > 0) {
		throw new Error('Initial build failed');
	}
	
	if (watch) {
		await ctx.watch(); // Stays watching for subsequent changes and rebuilds
	} else {
		await ctx.rebuild();
		await ctx.dispose();
	}
}

function copyAssets() {
	let excludedDirs = ['dicts', 'logs', '.DS_Store', 'Thumbs.db', 'files/'];
	excludedDirs = excludedDirs.map(ex => ex.replace(/\/$|\\$/, ''));
	
	fsExtra.copy('media', 'resources/media', {
		overwrite: true,
		filter: (src, dest) => {
			const relativePath = path.relative('media', src);

			const probableFiles = excludedDirs.filter(ex => ex.startsWith('.'));
			const probableDirs = excludedDirs.filter(ex => !ex.startsWith('.'));

			// Exclude files anywhere via endsWith (more precise than basename for extensions)
      		if (probableFiles.some(excluded => relativePath.endsWith(excluded))) {
        		return false;
      		}

			// Recursive dir exclusion: Check if path contains the dir segment
      		if (probableDirs.some(excluded => {
        		const excludedSegment = `${path.sep}${excluded}${path.sep}`;
        		return relativePath.includes(excludedSegment) || 
               		relativePath === excluded || 
               		relativePath.startsWith(`${excluded}${path.sep}`);
      		})) {
        		return false;
      		}
      		return true;
		}
	})
	.then(() => {
    	console.log('Assets copied to resources/media');
		
		// Rename source files to runtime names
		const draftWebViewEditorHTML = path.join(
			__dirname,
			'resources/media/questionEditorDraft.html'
		);
		const runtimeWebViewEditorHTML = path.join(
			__dirname,
			'resources/media/questionEditor.html'
		);
		const webViewEditorHTMLfilename = path.basename(runtimeWebViewEditorHTML);
		try {
    		fsExtra.moveSync(
				draftWebViewEditorHTML,
				runtimeWebViewEditorHTML,
				{ overwrite: true }
			);
    		console.log(`${webViewEditorHTMLfilename} renamed successfully!`);
		} catch (error) {
    		console.error('Error renaming file:', error);
		}
    })
    .catch(err => {
    	console.error('Error copying assets:', err);
    });
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
