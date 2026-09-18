const { parentPort, workerData } = require('worker_threads');
const { scrapeDirectory } = require('./importer');

function slimProgress(progress) {
  const entries = (progress.entries || []).map((entry) => ({
    ...entry,
    raw: entry.raw || null,
  }));
  return { ...progress, entries };
}

if (parentPort) {
  (async () => {
    try {
      const result = await scrapeDirectory(workerData.rootDir, {
        prefs: workerData.prefs || {},
        onProgress: (progress) => {
          parentPort.postMessage({ type: 'progress', progress: slimProgress(progress) });
        },
      });
      parentPort.postMessage({ type: 'done', files: result.files });
    } catch (error) {
      parentPort.postMessage({ type: 'error', error: String(error && error.message ? error.message : error) });
    }
  })();
}
