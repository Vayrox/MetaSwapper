const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const archiver = require("archiver");
const processor = require("./processor");

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 720,
    minWidth: 700,
    minHeight: 500,
    title: "MetaSwapper",
    backgroundColor: "#0a0a0f",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "public", "index.html"));
  mainWindow.setMenuBarVisibility(false);
}

app.whenReady().then(createWindow);

app.on("window-all-closed", async () => {
  await processor.shutdown();
  app.quit();
});

// ---- IPC Handlers ----

// Open native file picker
ipcMain.handle("pick-files", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Select Photos",
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Images", extensions: ["jpg", "jpeg", "png", "heic", "heif", "tiff", "tif", "webp"] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return [];
  return processor.addFiles(result.filePaths);
});

// Add files by paths (from drag & drop)
ipcMain.handle("add-files", (_, filePaths) => {
  return processor.addFiles(filePaths);
});

// Get all jobs
ipcMain.handle("get-queue", () => {
  return processor.getAllJobs();
});

// Get single job with metadata
ipcMain.handle("get-job", (_, id) => {
  const job = processor.getJob(id);
  if (!job) return null;
  return {
    id: job.id,
    originalName: job.originalName,
    status: job.status,
    uploadedAt: job.uploadedAt,
    error: job.error,
    originalMeta: job.originalMeta,
    newMeta: job.newMeta,
  };
});

// Delete a job
ipcMain.handle("delete-job", (_, id) => {
  return processor.deleteJob(id);
});

// Save single file — native save dialog
ipcMain.handle("save-file", async (_, id) => {
  const job = processor.getJob(id);
  if (!job || job.status !== "done" || !job.processedPath) return false;

  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Save Processed Photo",
    defaultPath: job.originalName,
    filters: [
      { name: "Images", extensions: [path.extname(job.originalName).slice(1)] },
    ],
  });
  if (result.canceled) return false;

  fs.copyFileSync(job.processedPath, result.filePath);
  return true;
});

// Save all as zip — native save dialog
ipcMain.handle("save-all", async () => {
  const allJobs = processor.getAllJobs();
  const doneJobs = allJobs
    .map((j) => processor.getJob(j.id))
    .filter((j) => j && j.status === "done" && j.processedPath);

  if (doneJobs.length === 0) return false;

  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Save All Processed Photos",
    defaultPath: "MetaSwapper-photos.zip",
    filters: [{ name: "ZIP Archive", extensions: ["zip"] }],
  });
  if (result.canceled) return false;

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(result.filePath);
    const archive = archiver("zip", { zlib: { level: 5 } });

    output.on("close", () => resolve(true));
    archive.on("error", (err) => reject(err));
    archive.pipe(output);

    for (const job of doneJobs) {
      if (fs.existsSync(job.processedPath)) {
        archive.file(job.processedPath, { name: job.originalName });
      }
    }

    archive.finalize();
  });
});
