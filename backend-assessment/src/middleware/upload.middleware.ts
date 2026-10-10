
import multer from "multer";
import path from "node:path";
import { randomUUID } from "node:crypto";
import fs from "node:fs";

const uploadDirectory = path.resolve("uploads");

fs.mkdirSync(uploadDirectory, { recursive: true });

const maxFileSize = Number(process.env.UPLOAD_MAX_BYTES) || 10 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, uploadDirectory);
  },

  filename: (_req, file, callback) => {
    callback(null, `${randomUUID()}.csv`);
  },
});

function fileFilter(
  _req: Express.Request,
  file: Express.Multer.File,
  callback: multer.FileFilterCallback,
) {
  const extension = path.extname(file.originalname).toLowerCase();

  if (extension !== ".csv") {
    return callback(new Error("Only CSV files are allowed"));
  }

  callback(null, true);
}

export const uploadCsv = multer({
  storage,
  limits: {
    fileSize: maxFileSize,
    files: 1,
  },
  fileFilter,
}).single("file");
