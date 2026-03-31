// frontend/src/services/indexedStorage.ts
/**
 * Simple IndexedDB wrapper for storing large binary blobs (like audio)
 * that would otherwise crash or get truncated by localStorage/AlaSQL string limits.
 */

const DB_NAME = 'NeuroSense_MediaStore';
const DB_VERSION = 1;
const STORE_NAME = 'audio_blobs';

function initDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const db = (e.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
        request.onerror = (e) => reject((e.target as IDBOpenDBRequest).error);
    });
}

export async function storeAudioBlob(recordId: string, blob: Blob): Promise<void> {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(blob, recordId);
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

export async function getAudioBlob(recordId: string): Promise<Blob | null> {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(recordId);
        
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
    });
}

export async function deleteAudioBlob(recordId: string): Promise<void> {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(recordId);
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}
