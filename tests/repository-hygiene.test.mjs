import fs from 'node:fs';
import path from 'node:path';
import { runStandalone } from './support/test-harness.mjs';

function isTextFile(relativePath, size) {
    const extension = path.extname(relativePath).toLowerCase();
    const basename = path.basename(relativePath);
    const textExtensions = new Set([
        '.bat',
        '.css',
        '.csv',
        '.example',
        '.html',
        '.java',
        '.js',
        '.json',
        '.md',
        '.mjs',
        '.properties',
        '.py',
        '.svg',
        '.toml',
        '.txt',
        '.xml',
        '.yml',
        '.yaml'
    ]);

    return basename === '.gitignore' || textExtensions.has(extension) || size <= 1024;
}

function hasConflictMarkers(content) {
    return /(^|\n)(<<<<<<<|=======|>>>>>>>)( |\n|$)/.test(content);
}

async function auditTrackedFiles(ctx) {
    if (!fs.existsSync(path.join(ctx.projectRoot, '.git'))) {
        ctx.skip('repository hygiene', 'tracked files, secrets, and removed .kiro content are clean', 'not a git repository');
        return 'not a git repository';
    }

    const files = ctx.listTrackedFiles();
    ctx.assert(files.length > 0, 'git ls-files returned no tracked files');

    const stats = {
        total: files.length,
        text: 0,
        binary: 0,
        videos: 0
    };

    for (const relativePath of files) {
        const absolutePath = path.join(ctx.projectRoot, relativePath);
        ctx.assert(fs.existsSync(absolutePath), `tracked file is missing from working tree: ${relativePath}`);

        const fileStat = fs.statSync(absolutePath);
        ctx.assert(fileStat.size > 0 || relativePath.endsWith('.gitkeep'), `tracked file is empty: ${relativePath}`);

        if (relativePath.endsWith('.mp4')) {
            stats.videos += 1;
            stats.binary += 1;
            ctx.assert(fileStat.size > 1024, `video asset is unexpectedly small: ${relativePath}`);
            continue;
        }

        if (isTextFile(relativePath, fileStat.size)) {
            stats.text += 1;
            if (fileStat.size <= 8 * 1024 * 1024) {
                const content = fs.readFileSync(absolutePath, 'utf8');
                ctx.assert(!hasConflictMarkers(content), `merge conflict marker found in ${relativePath}`);
                ctx.assert(!/\bAGORA_APP_CERTIFICATE\s*=\s*[0-9a-f]{32}\b/i.test(content), `secret-like Agora certificate found in ${relativePath}`);
                if (relativePath === '.gitignore') {
                    ctx.assert(content.includes('.env'), '.gitignore must ignore .env');
                    ctx.assert(content.includes('.run/'), '.gitignore must ignore .run/');
                    ctx.assert(content.includes('.kiro/'), '.gitignore must ignore .kiro/');
                }
            }
        } else {
            stats.binary += 1;
        }

        if (ctx.config.verboseFiles) {
            console.log(`  checked ${relativePath}`);
        }
    }

    const trackedKiro = ctx.listTrackedFiles(['.kiro']);
    ctx.assert(trackedKiro.length === 0, `tracked .kiro files remain: ${trackedKiro.slice(0, 5).join(', ')}`);

    const trackedEnv = ctx.listTrackedFiles(['.env', 'backend/.env']);
    ctx.assert(trackedEnv.length === 0, `environment file is tracked: ${trackedEnv.join(', ')}`);

    return `${stats.total} tracked files checked (${stats.videos} sign videos, ${stats.text} text files)`;
}

export async function run(ctx) {
    await ctx.step('repository hygiene', 'tracked files, secrets, and removed .kiro content are clean', auditTrackedFiles);
}

await runStandalone(import.meta.url, run);
