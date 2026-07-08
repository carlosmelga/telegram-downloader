import { NewMessage } from "telegram/events/index.js";
import { getClient } from "./lib/client.js";
import { ensureConfig } from "./lib/setup.js";
import { saveConfig } from "./lib/config.js";
import { downloadFile, registerFile } from "./lib/download.js";
import { runBackfill } from "./lib/backfill.js";
import { schedule, setConcurrency } from "./lib/limiter.js";
import { queue, STATUS } from "./lib/queue.js";
import { startUI } from "./lib/ui.js";
import { runHeadless } from "./lib/headless.js";

function enqueue(client, message, downloadDir) {
  if (!registerFile(message)) return;
  schedule(() => downloadFile(client, message, downloadDir).catch(() => {}));
}

async function main() {
  const config = await ensureConfig();
  setConcurrency(config.concurrency);

  const client = await getClient(config);

  let currentHandler = (event) => enqueue(client, event.message, config.downloadDir);
  let currentEvent = new NewMessage({ chats: [config.source] });
  client.addEventHandler(currentHandler, currentEvent);

  if (!process.stdout.isTTY) {
    await runHeadless(config.sourceLabel || config.source);
    return;
  }

  startUI({
    config,
    onQuit: async () => {
      await client.disconnect();
      process.exit(0);
    },
    onBackfill: (count) => runBackfill(client, config.source, config.downloadDir, count),
    onDeleteCompleted: async () => {
      const done = queue.list().filter((it) => it.status === STATUS.DONE);
      if (!done.length) return;
      await client.deleteMessages(config.source, done.map((it) => it.messageId), { revoke: true });
      queue.removeMany(done.map((it) => it.id));
    },
    onListDialogs: () => client.getDialogs({ limit: 50 }),
    onChangeSource: async (dialog) => {
      client.removeEventHandler(currentHandler, currentEvent);
      config.source = String(dialog.id);
      config.sourceLabel = dialog.title || dialog.name;
      saveConfig(config);

      currentHandler = (event) => enqueue(client, event.message, config.downloadDir);
      currentEvent = new NewMessage({ chats: [config.source] });
      client.addEventHandler(currentHandler, currentEvent);
    },
    onChangeConcurrency: (n) => {
      setConcurrency(n);
      saveConfig(config);
    },
    onChangeDownloadDir: (dir) => {
      saveConfig(config);
    },
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
