
export interface Page {
  id: string;
  name: string;
  file?: File | Blob; // Made optional for Server-based images
  url: string; // ObjectURL or Remote URL
}

export interface Chapter {
  id: string;
  title: string;
  pages: Page[];
  order: number;
}

export interface Manga {
  id: string;
  sourceId?: string; // Original folder ID or name
  title: string;
  altTitle?: string;
  coverUrl: string; // ObjectURL or Remote URL
  chapters: Chapter[];
  addedAt: number;
  lastReadAt: number;
  readCount: number; // New: Track how many times read
  isPinned: boolean;
  totalChapters: number;
  totalPages: number;
  path: string; // Original folder path
  isServer?: boolean; // New flag to indicate this comes from the API
  
  // Enhanced Metadata
  author?: string;
  keywords?: string[];
  collectionIds?: string[]; // IDs of collections this manga belongs to
}

export enum ViewMode {
  Grid = 'GRID',
  // Spine removed
}

export enum ReaderMode {
  Single = 'SINGLE',
  Double = 'DOUBLE', // RTL
  Vertical = 'VERTICAL',
}

export interface ReadingProgress {
  mangaId: string;
  chapterId: string;
  pageIndex: number;
}

export type SortOption = 'NAME' | 'DATE_ADDED' | 'RECENTLY_READ' | 'MOST_READ';

export interface Collection {
  id: string;
  name: string;
}

export interface AppSettings {
  theme: 'gentle' | 'fresh' | 'playful';
  enableScrollTurn: boolean;
  panicKey: string; // New setting for custom panic key
  readerBackgroundColor: string; // New setting for reader background
  longPressDuration: number; // New setting for drag delay
  toggleMenuKey: string; // New setting for reader menu toggle
  enableDownloadPopup: boolean; // New: Toggle homepage download notification
  collections: Collection[]; // List of user created collections
}

export interface AIAnalysisResult {
  summary: string;
  genres: string[];
  demographic: string;
  artStyle: string;
  rating: number;
}