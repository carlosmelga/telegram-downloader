import pLimit from "p-limit";

let current = pLimit(4);

export function schedule(fn) {
  return current(fn);
}

export function setConcurrency(n) {
  current = pLimit(n);
}
