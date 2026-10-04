/** Session-only LRU. Blobs are never persisted to a shared/browser disk cache. */
export class PhotoCache {
  private scope: string | null = null;
  private blobs = new Map<string, Blob>();
  private pending = new Map<string, Promise<Blob>>();
  private bytes = 0;

  constructor(private readonly maxBytes = 20 * 1024 * 1024) {}

  setScope(scope: string | null) {
    if (scope === this.scope) return;
    this.clear();
    this.scope = scope;
  }

  clear() {
    this.blobs.clear();
    this.pending.clear();
    this.bytes = 0;
  }

  removePost(postId: string) {
    const prefix = `${postId}:`;
    for (const [key, blob] of this.blobs) {
      if (key.startsWith(prefix)) {
        this.bytes -= blob.size;
        this.blobs.delete(key);
      }
    }
    for (const key of this.pending.keys()) {
      if (key.startsWith(prefix)) this.pending.delete(key);
    }
  }

  read(key: string, load: () => Promise<Blob>): Promise<Blob> {
    if (!this.scope)
      return Promise.reject(new Error("사진을 보려면 입장해주세요."));
    const cached = this.blobs.get(key);
    if (cached) {
      this.blobs.delete(key);
      this.blobs.set(key, cached);
      return Promise.resolve(cached);
    }
    const pending = this.pending.get(key);
    if (pending) return pending;
    const request = Promise.resolve()
      .then(load)
      .then((blob) => {
        // Logout, reset or deletion may have invalidated an in-flight request.
        if (this.pending.get(key) !== request)
          throw new Error("사진 접근 상태가 변경되었어요. 다시 열어주세요.");
        if (blob.size <= this.maxBytes) {
          while (this.bytes + blob.size > this.maxBytes) {
            const oldest = this.blobs.keys().next().value!;
            this.bytes -= this.blobs.get(oldest)!.size;
            this.blobs.delete(oldest);
          }
          this.blobs.set(key, blob);
          this.bytes += blob.size;
        }
        return blob;
      })
      .finally(() => {
        if (this.pending.get(key) === request) this.pending.delete(key);
      });
    this.pending.set(key, request);
    return request;
  }
}

export const photoCache = new PhotoCache();
