const path = require("path");
const fs = require("fs");
const os = require("os");
const { v4: uuidv4 } = require("uuid");
const { exiftool } = require("exiftool-vendored");
const { buildIPhone16ProMetadata } = require("./iphone16pro-template");

const WORK_DIR = path.join(os.tmpdir(), "metaswapper-processed");
fs.mkdirSync(WORK_DIR, { recursive: true });

// In-memory job store
const jobs = new Map();

function getAllJobs() {
  return [...jobs.values()]
    .sort((a, b) => b.uploadedAt - a.uploadedAt)
    .map(({ id, originalName, sourcePath, status, uploadedAt, error }) => ({
      id,
      originalName,
      sourcePath,
      status,
      uploadedAt,
      error,
    }));
}

function getJob(id) {
  return jobs.get(id) || null;
}

function addFiles(filePaths) {
  const created = [];
  for (const fp of filePaths) {
    const ext = path.extname(fp);
    const allowed = /\.(jpeg|jpg|png|heic|heif|tiff|tif|webp)$/i;
    if (!allowed.test(ext)) continue;

    const id = uuidv4();
    const job = {
      id,
      originalName: path.basename(fp),
      sourcePath: fp,
      processedPath: null,
      status: "queued",
      uploadedAt: Date.now(),
      originalMeta: null,
      newMeta: null,
      error: null,
    };
    jobs.set(id, job);
    created.push(id);

    // Start processing async
    processJob(id);
  }
  return created;
}

async function processJob(id) {
  const job = jobs.get(id);
  if (!job) return;

  job.status = "processing";
  const destPath = path.join(WORK_DIR, `${id}${path.extname(job.sourcePath)}`);

  try {
    // 1. Read original metadata
    const originalTags = await exiftool.read(job.sourcePath);
    job.originalMeta = flattenTags(originalTags);

    // 2. Copy to temp working dir
    fs.copyFileSync(job.sourcePath, destPath);

    // 3. Strip all metadata
    await exiftool.write(destPath, {}, ["-all=", "-overwrite_original"]);

    // 4. Write iPhone 16 Pro metadata
    const iphoneMeta = buildIPhone16ProMetadata({
      width: originalTags.ImageWidth || 4032,
      height: originalTags.ImageHeight || 3024,
    });
    await exiftool.write(destPath, iphoneMeta, ["-overwrite_original"]);

    // 5. Re-read to confirm
    const newTags = await exiftool.read(destPath);
    job.newMeta = flattenTags(newTags);

    job.processedPath = destPath;
    job.status = "done";
  } catch (err) {
    job.status = "error";
    job.error = err.message;
    console.error(`Job ${id} failed:`, err);
  }
}

function deleteJob(id) {
  const job = jobs.get(id);
  if (!job) return false;
  if (job.processedPath && fs.existsSync(job.processedPath)) {
    fs.unlinkSync(job.processedPath);
  }
  jobs.delete(id);
  return true;
}

function flattenTags(tags) {
  const out = {};
  for (const [k, v] of Object.entries(tags)) {
    if (k === "errors" || k === "warnings") continue;
    if (v && typeof v === "object" && v.rawValue !== undefined) {
      out[k] = v.rawValue;
    } else if (v && typeof v === "object" && typeof v.toString === "function" && v.constructor.name !== "Object") {
      out[k] = String(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

async function shutdown() {
  await exiftool.end();
}

module.exports = { getAllJobs, getJob, addFiles, deleteJob, shutdown };
