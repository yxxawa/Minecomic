import { ReadingProgress } from '../types';

const API_URL = 'http://localhost:8000';

// Generic Metadata Updater
export const updateMetadata = async (id: string, data: any) => {
    try {
        await fetch(`${API_URL}/update_metadata`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, ...data })
        });
    } catch (e) {
        console.error("Failed to update metadata", e);
    }
};

export const updateBatchMetadata = async (updates: any[]) => {
    try {
        await fetch(`${API_URL}/update_metadata_batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ updates })
        });
    } catch (e) {
        console.error("Failed to batch update metadata", e);
    }
};

export const saveProgress = async (progress: ReadingProgress) => {
    // Save progress as part of metadata
    await updateMetadata(progress.mangaId, { 
        progress: { 
            chapterId: progress.chapterId, 
            pageIndex: progress.pageIndex 
        } 
    });
};

export const getProgress = async (mangaId: string): Promise<ReadingProgress | undefined> => {
    try {
        const res = await fetch(`${API_URL}/metadata/${mangaId}`);
        if (res.ok) {
            const data = await res.json();
            if (data && data.progress) {
                return {
                    mangaId,
                    chapterId: data.progress.chapterId,
                    pageIndex: data.progress.pageIndex
                };
            }
        }
    } catch (e) {
        console.error("Failed to fetch progress", e);
    }
    return undefined;
};

// --- Legacy/Unused Functions (Kept empty/dummy to prevent build breaks if referenced elsewhere temporarily) ---

export const initDB = async () => null;
export const saveDirectoryHandle = async () => {};
export const getDirectoryHandle = async () => undefined;
export const clearDirectoryHandle = async () => {};
export const saveMangaMetadata = async () => {}; // Replaced by updateMetadata
export const getAllMangaMetadata = async () => []; // Replaced by server library fetch
export const saveLibraryToCache = async () => {};
export const loadLibraryFromCache = async () => [];
export const clearLibraryCache = async () => {};
export const deleteMangaFromCache = async () => {};
export const updateMangaInCache = async () => {};