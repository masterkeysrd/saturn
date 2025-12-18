const STORAGE_KEY = "saturn";

export function saveItem(key: string, value: string): void {
  if (!key) {
    throw new Error("Key must be provided");
  }

  localStorage.setItem(`${STORAGE_KEY}:${key}`, value);
}

export function loadItem(key: string): string | null {
  if (!key) {
    throw new Error("Key must be provided");
  }

  return localStorage.getItem(`${STORAGE_KEY}:${key}`);
}

export function removeItem(key: string): void {
  if (!key) {
    throw new Error("Key must be provided");
  }

  localStorage.removeItem(`${STORAGE_KEY}:${key}`);
}

export const localStore = {
  save: saveItem,
  load: loadItem,
  remove: removeItem,
};
