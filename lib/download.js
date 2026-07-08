import fs from "fs";
import path from "path";
import { queue, STATUS } from "./queue.js";

export function extractFile(message) {
  const doc = message.document;
  if (!doc) return null;

  const mime = doc.mimeType || "";
  const nameAttr = doc.attributes?.find((a) => a.fileName)?.fileName;
  const fallbackExt = mime ? `.${mime.split("/")[1]?.split(";")[0] || "bin"}` : "";
  const fileName = nameAttr || `${message.chatId}_${message.id}${fallbackExt}`;

  return { fileName, size: Number(doc.size ?? 0) };
}

// Adds file to queue immediately (as pending), before it's actually downloaded.
// Lets the UI show the full backlog right away instead of only the N active downloads.
export function registerFile(message) {
  const info = extractFile(message);
  if (!info) return null;

  const id = `${message.chatId}_${message.id}`;
  queue.add(id, info.fileName, info.size, message.id);
  return { id, info };
}

export async function downloadFile(client, message, downloadDir) {
  const reg = registerFile(message);
  if (!reg) return null;
  const { id, info } = reg;

  await fs.promises.mkdir(downloadDir, { recursive: true });
  const dest = path.join(downloadDir, info.fileName);

  if (fs.existsSync(dest) && fs.statSync(dest).size === info.size && info.size > 0) {
    queue.update(id, { status: STATUS.DONE, received: info.size });
    return dest;
  }

  queue.update(id, { status: STATUS.DOWNLOADING });

  try {
    const buffer = await client.downloadMedia(message, {
      progressCallback: (received) => {
        queue.update(id, { received: Number(received) });
      },
    });

    await fs.promises.writeFile(dest, buffer);
    queue.update(id, { status: STATUS.DONE, received: info.size });
    return dest;
  } catch (err) {
    queue.update(id, { status: STATUS.ERROR, error: err.message });
    throw err;
  }
}
