import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { Logger, LogLevel } from "telegram/extensions/Logger.js";

export function createClient(config) {
  return new TelegramClient(new StringSession(config.session || ""), config.apiId, config.apiHash, {
    connectionRetries: 5,
    baseLogger: new Logger(LogLevel.NONE),
  });
}

export async function getClient(config) {
  const client = createClient(config);
  await client.connect();
  if (!(await client.checkAuthorization())) {
    throw new Error("Session invalid. Delete config.json and restart to log in again.");
  }
  return client;
}

export async function resolveEntity(client, source) {
  try {
    return await client.getEntity(source);
  } catch {
    // numeric id not yet cached in this session — hydrate cache from dialogs and retry
    await client.getDialogs({ limit: 200 });
    try {
      return await client.getEntity(source);
    } catch (err) {
      throw new Error(
        `Could not resolve chat "${source}": ${err.message}\n` +
          `If it's a chat with no messages yet, send it any message first, then restart.`
      );
    }
  }
}
