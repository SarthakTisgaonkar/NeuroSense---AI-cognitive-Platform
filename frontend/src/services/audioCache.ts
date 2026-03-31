/**
 * In-memory audio cache: stores object URLs for voice recordings
 * during the current browser session. These survive screen transitions
 * but are cleared on page reload (which is acceptable — localStorage
 * is too small for audio blobs).
 */

const cache = new Map<string, string>(); // recordId -> objectURL

export function storeAudio(recordId: string, blob: Blob): string {
    // Revoke any previous URL for this ID to avoid memory leaks
    const existing = cache.get(recordId);
    if (existing) URL.revokeObjectURL(existing);

    const url = URL.createObjectURL(blob);
    cache.set(recordId, url);
    return url;
}

export function getAudio(recordId: string): string | undefined {
    return cache.get(recordId);
}

export function revokeAudio(recordId: string): void {
    const url = cache.get(recordId);
    if (url) {
        URL.revokeObjectURL(url);
        cache.delete(recordId);
    }
}
