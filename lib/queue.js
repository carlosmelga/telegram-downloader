import { EventEmitter } from "events";

export const STATUS = {
  PENDING: "pending",
  DOWNLOADING: "downloading",
  DONE: "done",
  ERROR: "error",
};

class Queue extends EventEmitter {
  constructor() {
    super();
    this.items = new Map(); // id -> item
  }

  add(id, fileName, size, messageId) {
    if (this.items.has(id)) return this.items.get(id);
    const item = { id, fileName, size, received: 0, status: STATUS.PENDING, error: null, messageId };
    this.items.set(id, item);
    this.emit("change");
    return item;
  }

  update(id, patch) {
    const item = this.items.get(id);
    if (!item) return;
    Object.assign(item, patch);
    this.emit("change");
  }

  clearCompleted() {
    for (const [id, item] of this.items) {
      if (item.status === STATUS.DONE) this.items.delete(id);
    }
    this.emit("change");
  }

  removeMany(ids) {
    for (const id of ids) this.items.delete(id);
    this.emit("change");
  }

  list() {
    return [...this.items.values()];
  }
}

export const queue = new Queue();
