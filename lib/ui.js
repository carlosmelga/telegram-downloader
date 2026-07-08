import blessed from "neo-blessed";
import { queue, STATUS } from "./queue.js";

const FILTERS = ["all", STATUS.DOWNLOADING, STATUS.PENDING, STATUS.DONE, STATUS.ERROR];

const ICON = {
  [STATUS.PENDING]: "…",
  [STATUS.DOWNLOADING]: "↓",
  [STATUS.DONE]: "✓",
  [STATUS.ERROR]: "✗",
};

const HELP_TEXT = `
 {bold}q{/bold}          quit
 {bold}↑ ↓{/bold}        scroll list
 {bold}f{/bold}          cycle filter (all/downloading/pending/done/error)
 {bold}c{/bold}          clear completed from the list
 {bold}b{/bold}          backfill — scan chat history for files
 {bold}del{/bold}        delete completed files' messages from Telegram
 {bold}s{/bold}          settings — change channel / concurrency / download folder
 {bold}h{/bold}          toggle this help

 Press esc to close this and any menu.
`;

function kindLabel(d) {
  return d.isChannel ? "channel" : d.isGroup ? "group" : "user";
}

function humanSize(bytes) {
  if (!bytes) return "?";
  const mb = bytes / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)}GB` : `${mb.toFixed(1)}MB`;
}

function progressBar(received, total, width = 20) {
  if (!total) return "?".repeat(width);
  const pct = Math.min(1, received / total);
  const filled = Math.round(pct * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

export function startUI({
  config,
  onQuit,
  onBackfill,
  onDeleteCompleted,
  onListDialogs,
  onChangeSource,
  onChangeConcurrency,
  onChangeDownloadDir,
}) {
  const screen = blessed.screen({ smartCSR: true, title: "telegram-downloader" });

  const header = blessed.box({
    top: 0,
    left: 0,
    width: "100%",
    height: 1,
    tags: true,
    style: { fg: "black", bg: "cyan" },
  });

  const list = blessed.box({
    top: 1,
    left: 0,
    width: "100%",
    height: "100%-2",
    scrollable: true,
    alwaysScroll: true,
    keys: true,
    vi: true,
    mouse: true,
    tags: true,
    content: "",
    style: { fg: "white" },
  });

  const footer = blessed.box({
    bottom: 0,
    left: 0,
    width: "100%",
    height: 1,
    tags: true,
    content: "",
    style: { fg: "black", bg: "white" },
  });

  const prompt = blessed.prompt({
    border: "line",
    height: 5,
    width: "50%",
    top: "center",
    left: "center",
    label: " Input ",
    tags: true,
    keys: true,
    vi: true,
    style: { border: { fg: "cyan" } },
  });

  const confirm = blessed.question({
    border: "line",
    height: 6,
    width: "60%",
    top: "center",
    left: "center",
    label: " Confirm ",
    tags: true,
    keys: true,
    vi: true,
    style: { border: { fg: "red" } },
  });

  const menu = blessed.list({
    border: "line",
    label: " Settings ",
    top: "center",
    left: "center",
    width: "60%",
    height: 8,
    tags: true,
    keys: true,
    vi: true,
    mouse: true,
    style: { selected: { bg: "blue" }, border: { fg: "cyan" } },
  });

  const channelPicker = blessed.list({
    border: "line",
    label: " Pick a channel — enter to choose, esc to cancel ",
    top: "center",
    left: "center",
    width: "70%",
    height: "70%",
    tags: true,
    keys: true,
    vi: true,
    mouse: true,
    style: { selected: { bg: "blue" }, border: { fg: "cyan" } },
  });

  const helpBox = blessed.box({
    border: "line",
    label: " Help ",
    top: "center",
    left: "center",
    width: "60%",
    height: 14,
    tags: true,
    keys: true,
    content: HELP_TEXT,
    style: { border: { fg: "cyan" } },
  });

  screen.append(header);
  screen.append(list);
  screen.append(footer);
  screen.append(prompt);
  screen.append(confirm);
  screen.append(menu);
  screen.append(channelPicker);
  screen.append(helpBox);

  menu.hide();
  channelPicker.hide();
  helpBox.hide();

  let filterIdx = 0;
  let backfillRunning = false;
  let deleting = false;

  function updateHeader() {
    header.setContent(` telegram-downloader  |  source: ${config.sourceLabel || config.source}`);
    screen.render();
  }

  function renderFooter() {
    const filterName = FILTERS[filterIdx];
    const backfillHint = backfillRunning ? "{yellow-fg}backfill running…{/yellow-fg}" : "b backfill";
    const deleteHint = deleting ? "{yellow-fg}deleting…{/yellow-fg}" : "del delete done";
    footer.setContent(
      ` {bold}q{/bold} quit  {bold}f{/bold} filter[${filterName}]  {bold}c{/bold} clear done  {bold}${backfillHint}{/bold}  {bold}${deleteHint}{/bold}  {bold}s{/bold} settings  {bold}h{/bold} help`
    );
    screen.render();
  }

  function renderList() {
    const filter = FILTERS[filterIdx];
    const items = queue.list().filter((it) => filter === "all" || it.status === filter);

    if (items.length === 0) {
      list.setContent("  (empty — waiting for files)");
    } else {
      const lines = items.map((it) => {
        const icon = ICON[it.status];
        const bar = it.status === STATUS.DOWNLOADING ? progressBar(it.received, it.size) : "";
        const size = humanSize(it.size);
        const extra =
          it.status === STATUS.ERROR
            ? ` {red-fg}${it.error}{/red-fg}`
            : it.status === STATUS.DOWNLOADING
            ? ` ${bar} ${humanSize(it.received)}/${size}`
            : ` ${size}`;
        return ` ${icon} ${it.fileName}${extra}`;
      });
      list.setContent(lines.join("\n"));
    }
    screen.render();
  }

  function render() {
    renderList();
    renderFooter();
  }

  function closeOverlaysAndFocusList() {
    menu.hide();
    channelPicker.hide();
    helpBox.hide();
    list.focus();
    screen.render();
  }

  queue.on("change", render);

  screen.key(["q", "C-c"], () => {
    queue.off("change", render);
    screen.destroy();
    onQuit?.();
  });

  screen.key(["f"], () => {
    filterIdx = (filterIdx + 1) % FILTERS.length;
    render();
  });

  screen.key(["c"], () => {
    queue.clearCompleted();
  });

  screen.key(["h"], () => {
    if (helpBox.hidden === false) return closeOverlaysAndFocusList();
    helpBox.show();
    helpBox.focus();
    screen.render();
  });
  helpBox.key(["escape", "h", "q"], closeOverlaysAndFocusList);

  screen.key(["b"], () => {
    if (backfillRunning || !onBackfill) return;
    prompt.input("How many messages back? (default 100)", "", async (err, value) => {
      list.focus();
      screen.render();
      if (err) return;
      const n = parseInt(value, 10);
      const count = Number.isFinite(n) && n > 0 ? n : 100;

      backfillRunning = true;
      renderFooter();
      try {
        await onBackfill(count);
      } finally {
        backfillRunning = false;
        renderFooter();
      }
    });
  });

  screen.key(["delete"], () => {
    if (deleting || !onDeleteCompleted) return;
    const doneCount = queue.list().filter((it) => it.status === STATUS.DONE).length;
    if (doneCount === 0) return;

    confirm.ask(
      `Delete ${doneCount} completed file(s) from the Telegram chat? This cannot be undone. (y/n)`,
      async (err, value) => {
        list.focus();
        screen.render();
        if (err || !value) return;

        deleting = true;
        renderFooter();
        try {
          await onDeleteCompleted();
        } finally {
          deleting = false;
          renderFooter();
        }
      }
    );
  });

  screen.key(["s"], () => {
    menu.setItems([
      "Change channel",
      `Change concurrency (current: ${config.concurrency})`,
      `Change download folder (current: ${config.downloadDir})`,
      "Cancel",
    ]);
    menu.select(0);
    menu.show();
    menu.focus();
    screen.render();
  });
  menu.key(["escape"], closeOverlaysAndFocusList);
  channelPicker.key(["escape"], closeOverlaysAndFocusList);

  menu.on("select", async (_item, index) => {
    menu.hide();

    if (index === 0) {
      if (!onListDialogs) return closeOverlaysAndFocusList();
      const dialogs = await onListDialogs();
      channelPicker.setItems(dialogs.map((d) => `[${kindLabel(d)}] ${d.title || d.name}`));
      channelPicker.select(0);
      channelPicker.show();
      channelPicker.focus();
      screen.render();

      channelPicker.once("select", async (__item, cIdx) => {
        const chosen = dialogs[cIdx];
        closeOverlaysAndFocusList();
        if (!chosen) return;
        config.sourceLabel = chosen.title || chosen.name;
        updateHeader();
        await onChangeSource?.(chosen);
      });
      return;
    }

    if (index === 1) {
      prompt.input(`New concurrency (current: ${config.concurrency})`, "", (err, value) => {
        closeOverlaysAndFocusList();
        if (err || !value) return;
        const n = parseInt(value, 10);
        if (Number.isFinite(n) && n > 0) {
          config.concurrency = n;
          onChangeConcurrency?.(n);
          renderFooter();
        }
      });
      return;
    }

    if (index === 2) {
      prompt.input(`New download folder (current: ${config.downloadDir})`, "", (err, value) => {
        closeOverlaysAndFocusList();
        if (err || !value) return;
        config.downloadDir = value;
        onChangeDownloadDir?.(value);
      });
      return;
    }

    closeOverlaysAndFocusList();
  });

  updateHeader();
  list.focus();
  render();
  return screen;
}
