const esbuild = require("esbuild");
const fsExtra = require('fs-extra');

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
  fsExtra.copy('resources/media', 'dist/media', { overwrite: true })
    .then(() => {
      console.log('Assets copied to dist/media');
    })
    .catch(err => {
      console.error('Error copying assets:', err);
    });
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
