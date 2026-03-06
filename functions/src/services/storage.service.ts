import * as admin from "firebase-admin";

function getBucket() {
  const bucketName = process.env.GCS_BUCKET || "";
  return admin.storage().bucket(bucketName);
}

export async function uploadReceipt(
  telegramUserId: string,
  installmentId: string,
  fileBuffer: Buffer,
  mimeType: string
): Promise<string> {
  const extension = mimeType === "image/png" ? "png" : "jpg";
  const filePath = `receipts/${telegramUserId}/${installmentId}.${extension}`;

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
