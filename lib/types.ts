export type EventStatus = "draft" | "active" | "paused" | "ended";
export type UploadStatus = "pending" | "uploaded" | "failed";

export type EventRow = {
  id: string;
  event_name: string;
  event_slug: string;
  description: string | null;
  event_date: string | null;
  cover_image_url: string | null;
  cover_drive_file_id: string | null;
  google_drive_folder_id: string | null;
  status: EventStatus;
  upload_enabled: boolean;
  gallery_enabled: boolean;
  created_by: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
};

export type EventStats = {
  event_id: string;
  uploaded_count: number;
  failed_count: number;
  pending_count: number;
  last_upload_at: string | null;
};

export type AccessTokenRow = {
  id: string;
  event_id: string;
  kind: "link" | "code";
  token_hash: string;
  token_enc: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

export type PhotoRow = {
  id: string;
  event_id: string;
  guest_name: string | null;
  file_name: string;
  google_drive_file_id: string | null;
  mime_type: string;
  file_size: number;
  sha256: string | null;
  client_upload_id: string;
  upload_status: UploadStatus;
  error_message: string | null;
  uploaded_at: string | null;
  created_at: string;
  updated_at: string;
};

export type UploadLogRow = {
  id: string;
  event_id: string;
  photo_id: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
};

export type AdminRow = { id: string; user_id: string; role: "owner" | "admin"; created_at: string };

export type GoogleConnectionRow = {
  id: string;
  account_email: string | null;
  scope: string;
  refresh_token_enc: string;
  access_token_enc: string | null;
  access_token_expires_at: string | null;
  root_folder_id: string | null;
  status: "active" | "error" | "revoked";
  last_error: string | null;
  connected_by: string | null;
  created_at: string;
  updated_at: string;
};

/** What guests are allowed to know about an event. */
export type PublicEvent = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  date: string | null;
  coverUrl: string | null;
  status: EventStatus;
  uploadsOpen: boolean;
  galleryEnabled: boolean;
};

export type GalleryPhoto = {
  id: string;
  guestName: string | null;
  uploadedAt: string;
  thumbUrl: string;
  fullUrl: string;
  downloadUrl: string;
};
