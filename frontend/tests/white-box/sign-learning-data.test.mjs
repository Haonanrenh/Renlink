import path from 'node:path';
import fs from 'node:fs';
import { runStandalone } from '../../../tests/support/test-harness.mjs';

async function verifySignLearningData(ctx) {
    const catalog = ctx.loadSignCatalog();
    ctx.assert(Array.isArray(catalog), 'SIGN_LEARNING_CATALOG must be an array');
    ctx.assert(catalog.length === 6707, `expected 6707 learning items, got ${catalog.length}`);

    const ids = new Set();
    const datasetIds = new Set();
    const requiredKeys = [
        'id',
        'text',
        'type',
        'category',
        'difficulty',
        'tags',
        'sourceName',
        'sourceUrl',
        'datasetId',
        'playbackMode',
        'videoUrl',
        'avatarText',
        'notes'
    ].sort();
    const bannedSignals = ['ASL', 'American Sign Language', 'HKSL', 'Hong Kong Sign Language', '香港手语', '英文手语', '美国手语'];

    for (const [index, item] of catalog.entries()) {
        const label = `catalog item ${index + 1}`;
        ctx.assert(JSON.stringify(Object.keys(item).sort()) === JSON.stringify(requiredKeys), `${label} schema mismatch`);
        ctx.assert(typeof item.id === 'string' && item.id, `${label} missing id`);
        ctx.assert(!ids.has(item.id), `${label} duplicate id ${item.id}`);
        ids.add(item.id);
        ctx.assert(typeof item.text === 'string' && item.text.trim(), `${label} text must be non-empty`);
        ctx.assert(['word', 'phrase'].includes(item.type), `${label} invalid type`);
        ctx.assert(item.playbackMode === 'video', `${label} must use real video playback`);
        ctx.assert(typeof item.datasetId === 'string' && /^\d{4}$/.test(item.datasetId), `${label} invalid datasetId`);
        ctx.assert(!datasetIds.has(item.datasetId), `${label} duplicate datasetId ${item.datasetId}`);
        datasetIds.add(item.datasetId);
        ctx.assert(typeof item.videoUrl === 'string' && item.videoUrl.endsWith(`${item.datasetId}_p02_front.mp4`), `${label} invalid videoUrl`);

        const videoPath = path.join(ctx.projectRoot, 'frontend', item.videoUrl);
        ctx.assert(videoPath.startsWith(path.join(ctx.projectRoot, 'frontend')), `${label} video path escapes frontend`);
        ctx.assert(fs.existsSync(videoPath), `${label} video file missing: ${item.videoUrl}`);
        ctx.assert(fs.statSync(videoPath).size > 1024, `${label} video file is too small: ${item.videoUrl}`);

        const serialized = JSON.stringify(item);
        for (const signal of bannedSignals) {
            ctx.assert(!serialized.includes(signal), `${label} contains banned sign-language source signal: ${signal}`);
        }
    }

    const mustHave = new Map([
        ['1284', '医院'],
        ['1251', '学校'],
        ['2102', '医生'],
        ['3903', '请'],
        ['4046', '再见'],
        ['5094', '帮助'],
        ['6149', '厕所']
    ]);
    const byDatasetId = new Map(catalog.map((item) => [item.datasetId, item]));
    for (const [datasetId, text] of mustHave) {
        ctx.assert(byDatasetId.get(datasetId)?.text === text, `expected ${datasetId} to be ${text}`);
    }

    return `${catalog.length} real local Chinese sign videos verified`;
}

export async function run(ctx) {
    await ctx.step('white-box data', 'real local Chinese sign learning catalog and videos', verifySignLearningData);
}

await runStandalone(import.meta.url, run);
