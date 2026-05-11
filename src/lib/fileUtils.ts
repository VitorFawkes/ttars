import {
  Image,
  FileText,
  FileSpreadsheet,
  FileArchive,
  File,
  Presentation,
  type LucideIcon,
} from 'lucide-react'

export function getFileIcon(mimeType: string | null): LucideIcon {
  if (!mimeType) return File
  if (mimeType.startsWith('image/')) return Image
  if (mimeType === 'application/pdf') return FileText
  if (
    mimeType === 'application/msword' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'text/plain' ||
    mimeType === 'text/csv'
  )
    return FileText
  if (
    mimeType === 'application/vnd.ms-excel' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  )
    return FileSpreadsheet
  if (
    mimeType === 'application/vnd.ms-powerpoint' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  )
    return Presentation
  if (
    mimeType === 'application/zip' ||
    mimeType === 'application/x-rar-compressed'
  )
    return FileArchive
  return File
}

export function getFileIconColor(mimeType: string | null): string {
  if (!mimeType) return 'text-slate-400'
  if (mimeType.startsWith('image/')) return 'text-purple-500'
  if (mimeType === 'application/pdf') return 'text-red-500'
  if (
    mimeType === 'application/msword' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )
    return 'text-blue-500'
  if (
    mimeType === 'application/vnd.ms-excel' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  )
    return 'text-green-600'
  if (
    mimeType === 'application/vnd.ms-powerpoint' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  )
    return 'text-orange-500'
  if (
    mimeType === 'application/zip' ||
    mimeType === 'application/x-rar-compressed'
  )
    return 'text-amber-600'
  return 'text-slate-400'
}

export function formatFileSize(bytes: number | null): string {
  if (!bytes || bytes === 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function isImageMime(mimeType: string | null): boolean {
  if (!mimeType) return false
  return mimeType.startsWith('image/')
}

export function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toUpperCase() || ''
}

export const ACCEPTED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/x-rar-compressed',
].join(',')

export const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25MB
