const path = require('path');
const { Worker } = require('worker_threads');

function workerFile(name) {
  let file = path.join(__dirname, name);
  if (file.includes(`${path.sep}app.asar${path.sep}`)) {
    file = file.replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`);
  }
  return file;
}

function scrapeInWorker(rootDir, prefs, onProgress) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerFile('scrapeWorker.js'), {
      workerData: { rootDir, prefs },
    });
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };
    worker.on('message', (message) => {
      if (!message || typeof message !== 'object') return;
      if (message.type === 'progress') {
        onProgress(message.progress || {});
        return;
      }
      if (message.type === 'done') {
        finish(resolve, { files: message.files || 0 });
        worker.terminate();
        return;
      }
      if (message.type === 'error') {
        finish(reject, new Error(message.error || 'Scrape failed'));
        worker.terminate();
      }
    });
    worker.on('error', (error) => finish(reject, error));
    worker.on('exit', (code) => {
      if (!settled && code !== 0) finish(reject, new Error(`Scrape worker exited with code ${code}`));
    });
  });
}

module.exports = { scrapeInWorker };
