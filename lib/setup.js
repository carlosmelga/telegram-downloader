import input from "input";
import { loadConfig, saveConfig } from "./config.js";
import { createClient, getClient } from "./client.js";

function kindOf(dialog) {
  return dialog.isChannel ? "channel" : dialog.isGroup ? "group" : "user";
}

async function pickSource(client, config) {
  console.log("\nFetching chats...");
  const dialogs = await client.getDialogs({ limit: 50 });

  console.log("\nWhich chat should I listen to for files?\n");
  dialogs.forEach((d, i) => console.log(`  ${i + 1}. [${kindOf(d)}] ${d.title || d.name}`));

  const answer = await input.text("\nPick a number: ");
  const chosen = dialogs[parseInt(answer, 10) - 1];
  if (!chosen) throw new Error("Invalid selection.");

  config.source = String(chosen.id);
  config.sourceLabel = chosen.title || chosen.name || config.source;
  saveConfig(config);
  return dialogs;
}

// Runs the first-time wizard for whatever pieces of config are missing:
// api_id/api_hash -> login (phone/code/2FA) -> pick channel to listen to.
export async function ensureConfig() {
  const config = loadConfig();

  if (!config.apiId || !config.apiHash) {
    console.log("\nFirst-time setup. Get api_id / api_hash from https://my.telegram.org (API development tools)\n");
    config.apiId = Number(await input.text("API ID: "));
    config.apiHash = await input.text("API Hash: ");
    saveConfig(config);
  }

  if (!config.session) {
    const client = createClient(config);
    await client.connect();
    await client.start({
      phoneNumber: async () => input.text("Phone number: "),
      password: async () => input.text("2FA password (if any): "),
      phoneCode: async () => input.text("Code sent to Telegram: "),
      onError: (err) => console.error(err),
    });
    config.session = client.session.save();
    saveConfig(config);

    if (!config.source) await pickSource(client, config);
    await client.disconnect();
  } else if (!config.source) {
    const client = await getClient(config);
    await pickSource(client, config);
    await client.disconnect();
  }

  config.downloadDir = config.downloadDir || "./downloads";
  config.concurrency = config.concurrency || 4;
  saveConfig(config);

  return config;
}

export { pickSource, kindOf };
