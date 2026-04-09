export interface FileUploadParams {
  telegramUserId: string;
  installmentId: string;
  fileBuffer: Buffer;
  mimeType: string;
}

export interface UploadFileInternalParams extends FileUploadParams {
  folder: string;
}
