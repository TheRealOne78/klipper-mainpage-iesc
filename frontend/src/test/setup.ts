import "@testing-library/jest-dom/vitest";

// Node's own experimental global `localStorage` (present since Node 22) can
// shadow jsdom's implementation depending on Node/jsdom version combinations,
// leaving `localStorage`/`window.localStorage` undefined mid-test-run. Install
// a minimal in-memory Storage polyfill unconditionally so tests get
// deterministic behavior regardless of which runtime quirk is in play.
class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

const memoryStorage = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", {
  value: memoryStorage,
  configurable: true,
  writable: true,
});
Object.defineProperty(window, "localStorage", {
  value: memoryStorage,
  configurable: true,
  writable: true,
});
