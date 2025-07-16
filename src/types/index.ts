export interface ObsidianUrl {
  vault: string;
  file: string;
  path: string;
}

export interface TranslationRequest {
  url: string;
  targetLanguage?: string;
  mode?: 'replace' | 'append' | 'parallel';
}

export interface TranslationResult {
  originalContent: string;
  translatedContent: string;
  backupPath: string;
  timestamp: string;
}

export interface NoteMetadata {
  title: string;
  path: string;
  tags: string[];
  lastModified: Date;
  created: Date;
}

export interface BackupInfo {
  originalPath: string;
  backupPath: string;
  timestamp: string;
  size: number;
}

export enum ErrorCode {
  INVALID_URL = "INVALID_OBSIDIAN_URL",
  FILE_NOT_FOUND = "FILE_NOT_FOUND",
  VAULT_MISMATCH = "VAULT_MISMATCH",
  TRANSLATION_FAILED = "TRANSLATION_FAILED",
  BACKUP_FAILED = "BACKUP_FAILED",
  PERMISSION_DENIED = "PERMISSION_DENIED",
  INVALID_PATH = "INVALID_PATH"
}

export interface ErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
    details?: any;
  };
}

export interface SearchResult {
  path: string;
  title: string;
  excerpt: string;
  matches: number;
}