import { downloadFile, registerFile } from "./download.js";
import { schedule } from "./limiter.js";

export async function runBackfill(client, source, downloadDir, limitCount) {
  const matched = [];
  for await (const message of client.iterMessages(source, { limit: limitCount })) {
    if (registerFile(message)) matched.push(message);
  }

  await Promise.all(
    matched.map((message) => schedule(() => downloadFile(client, message, downloadDir).catch(() => {})))
  );
}
