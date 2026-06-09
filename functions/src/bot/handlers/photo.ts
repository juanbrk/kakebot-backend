import { Telegraf } from "telegraf";
import { KakebotContext, DocRouterWizardState } from "../../types/telegraf-context.types";
import https from "https";
import { DOC_ROUTER_SCENE_ID } from "../scenes/doc-router.scene";

export function registerPhotoHandler(bot: Telegraf<KakebotContext>): void {
  bot.on("photo", handlePhoto);
  bot.on("document", handleDocument);
}

async function handlePhoto(ctx: KakebotContext): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const photos = (ctx.message as any).photo as Array<{
    file_id: string;
  }>;

  if (!photos || photos.length === 0) {
    return;
  }

  const largestPhoto = photos[photos.length - 1];
  await ctx.scene.enter(DOC_ROUTER_SCENE_ID, { pendingFileId: largestPhoto.file_id, pendingFileType: "photo" } as DocRouterWizardState);
}

async function handleDocument(ctx: KakebotContext): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const document = (ctx.message as any).document as {
    file_id: string;
    mime_type?: string;
    file_name?: string;
  };

  if (!document) return;

  const isPdf = document.mime_type === "application/pdf";
  if (!isPdf) {
    await ctx.reply("Solo se aceptan archivos PDF.");
    return;
  }

  await ctx.scene.enter(DOC_ROUTER_SCENE_ID, { pendingFileId: document.file_id, pendingFileType: "pdf" } as DocRouterWizardState);
}

export function downloadFile(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          downloadFile(redirectUrl).then(resolve).catch(reject);
          return;
        }
      }

      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => resolve(Buffer.concat(chunks)));
      response.on("error", reject);
    }).on("error", reject);
  });
}
