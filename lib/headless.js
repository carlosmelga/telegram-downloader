import { queue, STATUS } from "./queue.js";

const LABEL = {
  [STATUS.PENDING]: "queued",
  [STATUS.DOWNLOADING]: "downloading",
  [STATUS.DONE]: "done",
  [STATUS.ERROR]: "error",
};

// No TTY (nohup/pm2/systemd) -> plain line-per-event logging instead of the blessed TUI.
export function runHeadless(sourceLabel) {
  console.log(`telegram-downloader running (headless) — source: ${sourceLabel}`);

  const lastStatus = new Map();

  queue.on("change", () => {
    for (const item of queue.list()) {
      if (lastStatus.get(item.id) === item.status) continue;
      lastStatus.set(item.id, item.status);

      const suffix = item.status === STATUS.ERROR ? ` — ${item.error}` : "";
      console.log(`[${LABEL[item.status]}] ${item.fileName}${suffix}`);
    }
  });

  return new Promise(() => {}); // keep process alive
}
