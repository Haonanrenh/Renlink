import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const catalogPath = path.join(projectRoot, 'frontend', 'data', 'sign-learning-catalog.js');
const frontendRoot = path.join(projectRoot, 'frontend');

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
];

const allowedTypes = new Set(['word', 'phrase']);
const allowedCategories = new Set([
    'greeting',
    'time',
    'traffic',
    'medical',
    'campus',
    'shopping',
    'help',
    'people',
    'place',
    'action',
    'food',
    'number',
    'nature',
    'general'
]);
const allowedPlaybackModes = new Set(['video', 'avatar']);
const bannedSignals = [
    'ASL',
    'American Sign Language',
    'HKSL',
    'Hong Kong Sign Language',
    '香港手语',
    '英文手语',
    '美国手语'
];

function loadCatalog() {
    const code = fs.readFileSync(catalogPath, 'utf8');
    const sandbox = { window: {} };
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox, { filename: catalogPath });
    return sandbox.window.SIGN_LEARNING_CATALOG;
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

const catalog = loadCatalog();
assert(Array.isArray(catalog), 'SIGN_LEARNING_CATALOG must be an array');
assert(catalog.length === 6707, `Expected all 6707 NationalCSL-DP catalog items, found ${catalog.length}`);
assert(catalog.every((item) => item.sourceName === 'NationalCSL-DP'), 'All entries should use NationalCSL-DP as the source');
assert(catalog.every((item) => item.playbackMode === 'video'), 'All entries should have real NationalCSL-DP video playback');

const ids = new Set();
const datasetIds = new Set();
const byDatasetId = new Map();

for (const [index, item] of catalog.entries()) {
    const prefix = `Item ${index + 1}`;
    const keys = Object.keys(item).sort();
    assert(
        JSON.stringify(keys) === JSON.stringify([...requiredKeys].sort()),
        `${prefix} has unexpected keys: ${keys.join(', ')}`
    );

    assert(typeof item.id === 'string' && item.id.trim(), `${prefix} id is required`);
    assert(!ids.has(item.id), `${prefix} duplicate id: ${item.id}`);
    ids.add(item.id);

    assert(typeof item.text === 'string' && item.text.trim(), `${prefix} text is required`);

    assert(allowedTypes.has(item.type), `${prefix} invalid type: ${item.type}`);
    assert(allowedCategories.has(item.category), `${prefix} invalid category: ${item.category}`);
    assert(typeof item.difficulty === 'string' && item.difficulty.trim(), `${prefix} difficulty is required`);
    assert(Array.isArray(item.tags) && item.tags.length > 0, `${prefix} tags must be a non-empty array`);
    assert(typeof item.sourceName === 'string' && item.sourceName.trim(), `${prefix} sourceName is required`);
    assert(typeof item.sourceUrl === 'string' && /^https?:\/\//.test(item.sourceUrl), `${prefix} sourceUrl must be http(s)`);
    assert(typeof item.datasetId === 'string' && /^\d{4}$/.test(item.datasetId), `${prefix} datasetId must be a four-digit string`);
    assert(!datasetIds.has(item.datasetId), `${prefix} duplicate datasetId: ${item.datasetId}`);
    datasetIds.add(item.datasetId);
    byDatasetId.set(item.datasetId, item);
    assert(allowedPlaybackModes.has(item.playbackMode), `${prefix} invalid playbackMode: ${item.playbackMode}`);
    assert(typeof item.videoUrl === 'string', `${prefix} videoUrl must be a string`);
    assert(typeof item.avatarText === 'string' && item.avatarText.trim(), `${prefix} avatarText is required`);
    assert(typeof item.notes === 'string' && item.notes.trim(), `${prefix} notes are required`);
    assert(item.videoUrl || item.avatarText, `${prefix} must provide videoUrl or avatarText`);

    const combinedText = JSON.stringify(item);
    for (const banned of bannedSignals) {
        assert(!combinedText.includes(banned), `${prefix} contains banned non-mainland CSL source signal: ${banned}`);
    }

    if (item.playbackMode === 'video') {
        assert(item.videoUrl, `${prefix} playbackMode=video requires videoUrl`);
        assert(!/^https?:\/\//.test(item.videoUrl), `${prefix} should use local lightweight video assets`);
        assert(
            item.videoUrl === `assets/sign-videos/nationalcsl/nationalcsl_${item.datasetId}_p02_front.mp4`,
            `${prefix} videoUrl should match NationalCSL-DP datasetId: ${item.videoUrl}`
        );
        const localVideoPath = path.join(frontendRoot, item.videoUrl);
        assert(
            localVideoPath.startsWith(frontendRoot) && fs.existsSync(localVideoPath),
            `${prefix} videoUrl does not resolve to a local file: ${item.videoUrl}`
        );
    }
}

const knownEntries = {
    '1284': '医院',
    '1251': '学校',
    '2102': '医生',
    '3903': '请',
    '4046': '再见',
    '5094': '帮助',
    '6149': '厕所'
};

for (const [datasetId, expectedText] of Object.entries(knownEntries)) {
    const item = byDatasetId.get(datasetId);
    assert(item, `Expected NationalCSL-DP #${datasetId} to be present`);
    assert(item.text === expectedText, `Expected #${datasetId} to be "${expectedText}", got "${item.text}"`);
}

console.log(`Verified ${catalog.length} real NationalCSL-DP Chinese sign learning catalog items and videos.`);
