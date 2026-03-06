import * as admin from "firebase-admin";

function getBucket() {
  const bucketName = process.env.GCS_BUCKET || "";
  return admin.storage().bucket(bucketName);
}

const EXTENSION_MAP: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "application/pdf": "pdf",
};

async function uploadFile(
  folder: string,
  telegramUserId: string,
  installmentId: string,
  fileBuffer: Buffer,
  mimeType: string
): Promise<string> {
  const extension = EXTENSION_MAP[mimeType] || "jpg";
  const filePath = `${folder}/${telegramUserId}/${installmentId}.${extension}`;

  const bucket = getBucket();
  const file = bucket.file(filePath);
  await file.save(fileBuffer, {
    metadata: { contentType: mimeType },
  });

  const isEmulator = !!process.env.FIREBASE_STORAGE_EMULATOR_HOST;
  if (!isEmulator) {
    await file.makePublic();
  }

  const emulatorHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
  if (emulatorHost) {
    return `http://${emulatorHost}/v0/b/${bucket.name}/o/${encodeURIComponent(filePath)}?alt=media`;
  }

  return `https://storage.googleapis.com/${bucket.name}/${filePath}`;
}

export async function uploadReceipt(
  telegramUserId: string,
  installmentId: string,
  fileBuffer: Buffer,
  mimeType: string
): Promise<string> {
  return uploadFile("receipts", telegramUserId, installmentId, fileBuffer, mimeType);
}

export async function uploadInvoice(
  telegramUserId: string,
  installmentId: string,
  fileBuffer: Buffer,
  mimeType: string
): Promise<string> {
  return uploadFile("invoices", telegramUserId, installmentId, fileBuffer, mimeType);
}
