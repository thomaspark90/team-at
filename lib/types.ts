export type InputMode = 'fixed' | 'manual';

export interface Category {
  name: string;
  items: string[];
}

export interface StoryData {
  date: string;
  backgroundUrl: string;
  inputMode: InputMode;
  categories: Category[];
  manualText: string;
}

export interface BlobItem {
  url: string;
  pathname: string;
  uploadedAt: string;
}
