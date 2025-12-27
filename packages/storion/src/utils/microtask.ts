function promiseMicrotask(fn: () => void) {
  return Promise.resolve().then(fn);
}

export const microtask =
  typeof queueMicrotask === "function" ? queueMicrotask : promiseMicrotask;
