const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const { exiftool } = require("exiftool-vendored");
const { buildIPhone16ProMetadata } = require("./iphone16pro-template");

const app = express();
const PORT = process.env.PORT || 3000;

// Directories
const UPLOAD_DIR = path.join(__dirname, "uploads");
const PROCESSED_DIR = path.join(__dirname, "processed");
[UPLOAD_DIR, PROCESSED_DIR].forEach((d) => fs.mkdirSync(d, { recursive: true }));

// Multer config
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR),
  filename: (_, file, cb) => {
    const id = uuidv4();
    cb(null, `${id}${path.extname(file.originalname)}`);
  },
});
const upload = multer({
  storage,
  fileFilter: (_, file, cb) => {
    const allowed = /jpeg|jpg|png|heic|heif|tiff|webp/i;
    if (allowed.test(path.extname(file.originalname))) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
  limits: { fileSize: 50 * 1024 * 1024 },
});

// In-memory queue
// States: queued -> processing -> done | error
const jobs = new Map();

// ---- API Routes ----

// Upload one or more photos into the queue
app.post("/api/upload", upload.array("photos", 50), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: "No files uploaded" });
  }

  const created = req.files.map((f) => {
    const id = path.basename(f.filename, path.extname(f.filename));
    const job = {
      id,
      originalName: f.originalname,
      filename: f.filename,
      status: "queued",
      uploadedAt: Date.now(),
      originalMeta: null,
      newMeta: null,
      error: null,
    };
    jobs.set(id, job);
    return { id, originalName: f.originalname, status: "queued" };
  });

  // Kick off processing
  created.forEach((j) => processJob(j.id));

  res.json({ jobs: created });
});

// Get queue status (all jobs)
app.get("/api/queue", (_, res) => {
  const list = [...jobs.values()]
    .sort((a, b) => b.uploadedAt - a.uploadedAt)
    .map(({ id, originalName, status, uploadedAt, error }) => ({
      id,
      originalName,
      status,
      uploadedAt,
      error,
    }));
  res.json({ jobs: list });
});

// Get single job details including before/after metadata
app.get("/api/job/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found" });
  res.json({
    id: job.id,
    originalName: job.originalName,
    status: job.status,
    uploadedAt: job.uploadedAt,
    error: job.error,
    originalMeta: job.originalMeta,
    newMeta: job.newMeta,
  });
});

// Read metadata of an uploaded file (checker – before swap)
app.get("/api/meta/original/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found" });
  res.json({ metadata: job.originalMeta });
});

// Read metadata of a processed file (checker – after swap)
app.get("/api/meta/swapped/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found" });
  if (job.status !== "done") return res.status(400).json({ error: "Not processed yet" });
  res.json({ metadata: job.newMeta });
});

// Download processed file
app.get("/api/download/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found" });
  if (job.status !== "done") return res.status(400).json({ error: "Not processed yet" });

  const filePath = path.join(PROCESSED_DIR, job.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File missing" });

  res.download(filePath, job.originalName);
});

// Delete a job and its files
app.delete("/api/job/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found" });

  // Clean up files
  const up = path.join(UPLOAD_DIR, job.filename);
  const pr = path.join(PROCESSED_DIR, job.filename);
  if (fs.existsSync(up)) fs.unlinkSync(up);
  if (fs.existsSync(pr)) fs.unlinkSync(pr);
  jobs.delete(req.params.id);

  res.json({ ok: true });
});

// Serve frontend
app.use(express.static(path.join(__dirname, "public")));

// ---- Processing logic ----

async function processJob(id) {
  const job = jobs.get(id);
  if (!job) return;

  job.status = "processing";
  const srcPath = path.join(UPLOAD_DIR, job.filename);
  const destPath = path.join(PROCESSED_DIR, job.filename);

  try {
    // 1. Read original metadata
    const originalTags = await exiftool.read(srcPath);
    job.originalMeta = flattenTags(originalTags);

    // 2. Copy source to processed dir
    fs.copyFileSync(srcPath, destPath);

    // 3. Strip all metadata
    await exiftool.write(destPath, {}, ["-all=", "-overwrite_original"]);

    // 4. Write iPhone 16 Pro metadata
    const iphoneMeta = buildIPhone16ProMetadata({
      width: originalTags.ImageWidth || 4032,
      height: originalTags.ImageHeight || 3024,
    });
    await exiftool.write(destPath, iphoneMeta, ["-overwrite_original"]);

    // 5. Re-read to confirm what was written
    const newTags = await exiftool.read(destPath);
    job.newMeta = flattenTags(newTags);

    job.status = "done";
  } catch (err) {
    job.status = "error";
    job.error = err.message;
    console.error(`Job ${id} failed:`, err);
  }
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

// Graceful shutdown
process.on("SIGINT", async () => {
  await exiftool.end();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`MetaSwapper running at http://localhost:${PORT}`);
});
