import multer from "multer";
import path from "node:path";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { env } from "../config/env";

const uploadDirectory = path.resolve("uploads");

fs.mkdirSync(uploadDirectory, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, uploadDirectory);
  },

  filename: (_req, file, callback) => {
    const ext = path.extname(file.originalname).toLowerCase();
    callback(null, `${randomUUID()}${ext || ".tmp"}`);
  },
});

function fileFilter(
  _req: Express.Request,
  file: Express.Multer.File,
  callback: multer.FileFilterCallback,
) {
  const extension = path.extname(file.originalname).toLowerCase();
  const allowedExtensions = [".csv", ".xlsx"];

  if (!allowedExtensions.includes(extension)) {
    const error = new Error("Only CSV and XLSX files are allowed");
    (error as unknown as { statusCode?: number }).statusCode = 400;
    return callback(error);
  }

  callback(null, true);
}

export const uploadFile = multer({
  storage,
  limits: {
    fileSize: env.UPLOAD_MAX_BYTES,
    files: 1,
  },
  fileFilter,
}).single("file");

// Retain uploadCsv export as alias for backward compatibility
export const uploadCsv = uploadFile;
