import fs from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';

async function buildStandalone() {
  console.log('Building standalone offline single-file dashboard...');

  const templatePath = path.resolve(process.cwd(), 'src/template.html');
  const cssPath = path.resolve(process.cwd(), 'src/styles.css');
  const appJsPath = path.resolve(process.cwd(), 'src/app.js');
  const distDir = path.resolve(process.cwd(), 'dist');
  const outputPath = path.join(distDir, 'class-snapshot-dashboard.html');

  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  // 1. Read HTML template and CSS
  const templateHtml = fs.readFileSync(templatePath, 'utf8');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  // 2. Bundle JavaScript & inlined SheetJS using esbuild
  const bundleResult = await esbuild.build({
    entryPoints: [appJsPath],
    bundle: true,
    minify: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2020', 'chrome80', 'firefox80', 'safari13', 'edge80'],
    write: false,
    define: {
      'process.env.NODE_ENV': '"production"'
    }
  });

  const bundledJs = bundleResult.outputFiles[0].text;

  // 3. Inline CSS and JS into single standalone HTML file
  let finalHtml = templateHtml.replace('/* CSS_INLINE_PLACEHOLDER */', cssContent);
  finalHtml = finalHtml.replace('/* JS_INLINE_PLACEHOLDER */', bundledJs);
  // The hosted standalone file must not request Google Fonts or any other external asset.
  finalHtml = finalHtml.replace(/^\s*<link\b[^>]*href="https:\/\/fonts\.(?:googleapis|gstatic)\.com[^"]*"[^>]*>\s*$/gm, '');

  // 4. Write output to dist/
  fs.writeFileSync(outputPath, finalHtml, 'utf8');

  const publicDistDir = path.resolve(process.cwd(), 'public/dist');
  if (!fs.existsSync(publicDistDir)) {
    fs.mkdirSync(publicDistDir, { recursive: true });
  }
  fs.writeFileSync(path.join(publicDistDir, 'class-snapshot-dashboard.html'), finalHtml, 'utf8');

  const stats = fs.statSync(outputPath);
  const sizeKb = Math.round(stats.size / 1024);

  console.log(`✓ Standalone HTML successfully created at: ${outputPath}`);
  console.log(`✓ Total self-contained file size: ${sizeKb} KB`);
}

buildStandalone().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
