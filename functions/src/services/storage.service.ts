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

  const emulatorHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
  if (emulatorHost) {
    return `http://${emulatorHost}/v0/b/${bucket.name}/o/${encodeURIComponent(filePath)}?alt=media`;
  }

  const [metadata] = await file.getMetadata();
  const token = (metadata.metadata as Record<string, string>)?.firebaseStorageDownloadTokens;
  const encodedPath = encodeURIComponent(filePath);
  const baseUrl = "https://firebasestorage.googleapis.com/v0/b";
  return `${baseUrl}/${bucket.name}/o/${encodedPath}?alt=media&token=${token}`;
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

/**
 * Uploads a card statement receipt to GCS under the "card_statements/" folder.
 *
 * @param {string} telegramUserId
 * @param {string} statementId - Firestore statement document ID
 * @param {Buffer} fileBuffer
 * @param {string} mimeType
 * @return {string} Public URL of the uploaded file
 */
export async function uploadStatementReceipt(
  telegramUserId: string,
  statementId: string,
  fileBuffer: Buffer,
  mimeType: string
): Promise<string> {
  return uploadFile(
    "card_statements", telegramUserId, statementId, fileBuffer, mimeType,
  );
}

/**
 * Downloads a stored file using the Admin SDK by extracting the GCS path from its Firebase Storage URL.
 * Works in both emulator and production — Admin SDK bypasses storage security rules in both environments.
 *
 * URL format (emulator and production share the same path structure):
 *   http(s)://host/v0/b/{bucket}/o/{encodedPath}?...
 *
 * @param {string} url - Firebase Storage URL as stored in Firestore (receiptUrl, invoiceUrl, etc.)
 * @return {{ buffer: Buffer, extension: string }}
 */
export async function downloadFromUrl(
  url: string
): Promise<{ buffer: Buffer; extension: string }> {
  const parsedUrl = new URL(url);
  const encodedPath = parsedUrl.pathname.split("/o/")[1];
  const filePath = decodeURIComponent(encodedPath);
  const extension = filePath.split(".").pop() || "pdf";

  const [fileBuffer] = await getBucket().file(filePath).download();
  return { buffer: fileBuffer, extension };
}
