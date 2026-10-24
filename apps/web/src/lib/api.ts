export interface UserProfile {
  id: string;
  email: string;
  full_name?: string | null;
  role: "admin" | "user" | "owner" | "viewer" | string;
  is_active: boolean;
  created_at: string;
}

export interface DocumentItem {
  id: string;
  owner_id: string;
  owner_email?: string;
  owner_name?: string | null;
  shared_at?: string | null;
  title: string;
  category: string;
  description?: string | null;
  storage_key?: string;
  mime_type: string;
  size_bytes: string | number;
  created_at: string;
  updated_at: string;
  access_level: "owner" | "edit" | "read" | string;
}

export interface DocumentPermissionItem {
  id: string;
  document_id: string;
  user_id: string;
  user_email?: string;
  permission: "read" | "edit";
  granted_by: string;
  granted_at: string;
  revoked_at: string | null;
}

export interface AuditLogItem {
  id: string | number;
  actor_id: string | null;
  actor_email?: string;
  actor_name?: string | null;
  document_id: string | null;
  document_title?: string;
  action: string;
  outcome: "success" | "failure" | "denied";
  details?: Record<string, any>;
  ip_address?: string;
  created_at: string;
}

export interface HealthResponse {
  status: string;
  timestamp?: string;
  error?: string;
}

// Default to empty string for relative paths (/api/...) that Vite proxies in development,
// or use explicit configured VITE_API_URL if specified in production.
export const API_BASE_URL = (import.meta.env.VITE_API_URL || "").trim().replace(/\/+$/, "");

/**
 * Standard headers for authenticated requests
 */
function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
  };
}

/**
 * Normalize and handle response errors
 */
async function handleResponse<T>(res: Response): Promise<T> {
  const contentType = res.headers.get("content-type") || "";
  let data: any = null;

  if (contentType.includes("application/json")) {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const errorMsg =
      data?.error ||
      data?.message ||
      `Request failed with status ${res.status} (${res.statusText})`;
    const error = new Error(errorMsg) as Error & { status?: number };
    error.status = res.status;
    throw error;
  }

  return data as T;
}

/**
 * Fetch authenticated profile from /api/me
 */
export async function fetchProfile(token: string): Promise<UserProfile> {
  const res = await fetch(`${API_BASE_URL}/api/me`, {
    headers: authHeaders(token),
  });
  const data = await handleResponse<{ user: UserProfile }>(res);
  return data.user;
}

/**
 * Update authenticated user profile (e.g. full_name)
 */
export async function updateUserProfile(
  token: string,
  updates: { full_name?: string }
): Promise<UserProfile> {
  const res = await fetch(`${API_BASE_URL}/api/me`, {
    method: "PATCH",
    headers: {
      ...authHeaders(token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(updates),
  });
  const data = await handleResponse<{ user: UserProfile }>(res);
  return data.user;
}

/**
 * List all documents accessible to the authenticated user.
 * Supports optional search query and view filtering.
 */
export async function fetchDocuments(
  token: string,
  params?: { q?: string; view?: string }
): Promise<DocumentItem[]> {
  const baseUrl = API_BASE_URL || (typeof window !== "undefined" ? window.location.origin : "");
  const url = new URL(`${baseUrl}/api/documents`, typeof window !== "undefined" ? window.location.origin : "http://localhost");
  if (params?.q) url.searchParams.set("q", params.q);
  if (params?.view) url.searchParams.set("view", params.view);

  const res = await fetch(url.toString(), {
    headers: authHeaders(token),
  });
  const data = await handleResponse<{ documents: DocumentItem[] }>(res);
  return data.documents || [];
}

/**
 * Get document details
 */
export async function fetchDocumentDetails(token: string, documentId: string): Promise<DocumentItem> {
  const res = await fetch(`${API_BASE_URL}/api/documents/${documentId}`, {
    headers: authHeaders(token),
  });
  const data = await handleResponse<{ document: DocumentItem }>(res);
  return data.document;
}

/**
 * Update document metadata (title, category, description).
 * Allowed for document owner and active editors.
 */
export async function updateDocumentMetadata(
  token: string,
  documentId: string,
  updates: { title?: string; category?: string; description?: string | null }
): Promise<DocumentItem> {
  const res = await fetch(`${API_BASE_URL}/api/documents/${documentId}`, {
    method: "PATCH",
    headers: {
      ...authHeaders(token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(updates),
  });
  const data = await handleResponse<{ document: DocumentItem }>(res);
  return data.document;
}

/**
 * Upload a document (supports multipart file upload or metadata-only)
 */
export async function uploadDocument(
  token: string,
  formData: FormData
): Promise<DocumentItem> {
  const res = await fetch(`${API_BASE_URL}/api/documents`, {
    method: "POST",
    headers: authHeaders(token),
    body: formData,
  });
  const data = await handleResponse<{ document: DocumentItem }>(res);
  return data.document;
}

/**
 * Download a document securely (verifies permissions and streams blob)
 */
export async function downloadDocument(
  token: string,
  documentId: string
): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch(`${API_BASE_URL}/api/documents/${documentId}/download`, {
    headers: authHeaders(token),
  });

  if (!res.ok) {
    await handleResponse(res); // will throw formatted error
  }

  const contentDisposition = res.headers.get("content-disposition") || "";
  let filename = `document-${documentId}`;

  // Parse RFC 5987 filename*=UTF-8''... or standard filename="..."
  const rfc5987Match = contentDisposition.match(/filename\*=UTF-8''([^;\n]+)/i);
  if (rfc5987Match && rfc5987Match[1]) {
    try {
      filename = decodeURIComponent(rfc5987Match[1].trim());
    } catch {
      filename = rfc5987Match[1].trim();
    }
  } else {
    const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
    if (filenameMatch && filenameMatch[1]) {
      filename = filenameMatch[1].replace(/['"]/g, "").trim();
    }
  }

  const contentType = res.headers.get("content-type") || "application/octet-stream";
  const arrayBuffer = await res.arrayBuffer();
  const blob = new Blob([arrayBuffer], { type: contentType });
  return { blob, filename };
}

/**
 * Soft-delete a document (owner only)
 */
export async function deleteDocument(token: string, documentId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/documents/${documentId}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  await handleResponse(res);
}

/**
 * List sharing permissions for a document
 */
export async function fetchDocumentPermissions(
  token: string,
  documentId: string
): Promise<DocumentPermissionItem[]> {
  const res = await fetch(`${API_BASE_URL}/api/documents/${documentId}/permissions`, {
    headers: authHeaders(token),
  });
  const data = await handleResponse<{ permissions: DocumentPermissionItem[] }>(res);
  return data.permissions || [];
}

/**
 * Grant document permission to another user by email or user_id
 */
export async function grantDocumentPermission(
  token: string,
  documentId: string,
  target: { email?: string; user_id?: string; permission: "read" | "edit" } | string,
  legacyPermission?: "read" | "edit"
): Promise<DocumentPermissionItem> {
  const body =
    typeof target === "string"
      ? { user_id: target, permission: legacyPermission || "read" }
      : target;

  const res = await fetch(`${API_BASE_URL}/api/documents/${documentId}/permissions`, {
    method: "POST",
    headers: {
      ...authHeaders(token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await handleResponse<{ permission: DocumentPermissionItem }>(res);
  return data.permission;
}

/**
 * Update existing document permission for a user ('read' <-> 'edit')
 */
export async function updateDocumentPermission(
  token: string,
  documentId: string,
  userId: string,
  permission: "read" | "edit"
): Promise<DocumentPermissionItem> {
  const res = await fetch(`${API_BASE_URL}/api/documents/${documentId}/permissions/${userId}`, {
    method: "PATCH",
    headers: {
      ...authHeaders(token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ permission }),
  });
  const data = await handleResponse<{ permission: DocumentPermissionItem }>(res);
  return data.permission;
}

/**
 * Revoke document permission
 */
export async function revokeDocumentPermission(
  token: string,
  documentId: string,
  userId: string
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/documents/${documentId}/permissions/${userId}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  await handleResponse(res);
}

/**
 * Fetch authorized user activity logs
 */
export async function fetchActivityLogs(
  token: string,
  params?: { limit?: number; offset?: number }
): Promise<AuditLogItem[]> {
  const url = new URL(`${API_BASE_URL}/api/documents/activity`, window.location.origin);
  if (params?.limit) url.searchParams.set("limit", String(params.limit));
  if (params?.offset) url.searchParams.set("offset", String(params.offset));

  const res = await fetch(url.toString(), {
    headers: authHeaders(token),
  });
  const data = await handleResponse<{ logs: AuditLogItem[] }>(res);
  return data.logs || [];
}

/**
 * Fetch administrative audit logs (admin only)
 */
export async function fetchAdminAuditLogs(
  token: string,
  params?: { limit?: number; offset?: number; action?: string; outcome?: string }
): Promise<{ logs: AuditLogItem[]; total: number }> {
  const baseUrl = API_BASE_URL || (typeof window !== "undefined" ? window.location.origin : "");
  const url = new URL(`${baseUrl}/api/admin/audit-logs`, typeof window !== "undefined" ? window.location.origin : "http://localhost");
  if (params?.limit) url.searchParams.set("limit", String(params.limit));
  if (params?.offset) url.searchParams.set("offset", String(params.offset));
  if (params?.action) url.searchParams.set("action", params.action);
  if (params?.outcome) url.searchParams.set("outcome", params.outcome);

  const res = await fetch(url.toString(), {
    headers: authHeaders(token),
  });
  const data = await handleResponse<any>(res);
  return {
    logs: data.audit_logs || data.logs || [],
    total: data.pagination?.total ?? data.total ?? 0,
  };
}

/**
 * Ping backend health
 */
export async function checkApiHealth(): Promise<HealthResponse> {
  try {
    const res = await fetch(`${API_BASE_URL}/health`);
    if (!res.ok) {
      return {
        status: "unhealthy",
        error: `Backend returned HTTP status ${res.status}`,
      };
    }
    const data = await res.json();
    return {
      status: data.status || "ok",
      timestamp: data.timestamp,
    };
  } catch (err: unknown) {
    return {
      status: "offline",
      error: err instanceof Error ? err.message : "Failed to connect to backend",
    };
  }
}
