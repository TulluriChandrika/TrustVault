# TrustVault — REST API Reference Documentation

TrustVault provides a RESTful API for secure, auditable document management and cryptographic permission delegation.

All authenticated endpoints require a valid Supabase Auth JWT access token passed via the standard HTTP `Authorization` header:

```http
Authorization: Bearer <supabase_jwt_access_token>
```

---

## 1. Security & Response Conventions

### 1.1 Non-Disclosure Philosophy (`404 Not Found` vs `403 Forbidden`)
To prevent document enumeration, ID probing, and metadata leakage:
- If a caller requests a document that does not exist **or** one to which they have neither ownership nor an active permission grant, the API returns:
  ```json
  { "error": "Document not found" }
  ```
  with HTTP status `404 Not Found`. A denied audit entry is recorded server-side without leaking document metadata or presence.
- HTTP `403 Forbidden` is returned when a caller's authenticated identity is confirmed to have access to a resource, but their specific role lacks privilege for the requested mutation (e.g., a `read` user attempting `PATCH /api/documents/:id`, an `edit` user attempting `DELETE /api/documents/:id`, or a non-admin attempting `GET /api/admin/audit-logs`).
- HTTP `401 Unauthorized` is returned when the Authorization header is missing, malformed, or the token is expired/invalid.

### 1.2 Rate Limiting & Payload Bounds
- **Rate Limit:** 100 requests per 15-minute window per IP address (`draft-8` rate limit headers).
- **JSON Payload Limit:** 2 MB max for application/json bodies.
- **Multipart Upload Limit:** 10 MB file max, exactly 1 file part, max 10 fields, max 20 parts.

---

## 2. Health & Service Status

### `GET /health`
Checks server liveness and PostgreSQL database connectivity.

- **Authentication:** None (Public).
- **Role Required:** Public.
- **Operations:** Performs `SELECT 1` on the PostgreSQL connection pool.
- **Success Response (`200 OK`):**
  ```json
  {
    "status": "ok",
    "timestamp": "2026-10-24T12:00:00.000Z"
  }
  ```
- **Error Response (`503 Service Unavailable`):**
  ```json
  {
    "status": "degraded",
    "timestamp": "2026-10-24T12:00:00.000Z",
    "error": "Database connection unavailable"
  }
  ```

---

## 3. Authentication & Profile Endpoints

### `GET /api/me` (and `GET /api/auth/me`)
Retrieves the profile of the currently authenticated user. Automatically synchronizes user profile records into `public.users` idempotently upon successful authentication.

- **Authentication:** `Bearer <token>`.
- **Role Required:** Any active authenticated user (`owner`, `user`, `admin`, `viewer`).
- **Operations:** Verifies token via Supabase Auth; upserts record in `public.users` preserving existing `role` and `is_active`.
- **Success Response (`200 OK`):**
  ```json
  {
    "user": {
      "id": "11111111-1111-4111-8111-111111111111",
      "email": "alex.morgan@trustvault.io",
      "full_name": "Alex Morgan",
      "role": "user",
      "is_active": true,
      "created_at": "2026-10-20T08:30:00.000Z"
    }
  }
  ```
- **Errors:**
  - `401 Unauthorized`: Token missing, malformed, or expired.
  - `403 Forbidden`: Account deactivated (`is_active = false`).

---

### `PATCH /api/me` (and `PATCH /api/auth/me`)
Updates permitted profile attributes (`full_name`) for the authenticated user. Privileged fields (`role`, `is_active`, `id`, `email`, `password_hash`) are strictly rejected.

- **Authentication:** `Bearer <token>`.
- **Role Required:** Any active authenticated user.
- **Request Body (`application/json`):**
  ```json
  {
    "full_name": "Alexandra Morgan"
  }
  ```
- **Validation Rules:**
  - `full_name`: Required non-empty string, trimmed, max 100 characters.
  - Forbidden fields: If `role`, `is_active`, `id`, or `email` are included, the request is rejected with `400 Bad Request`.
- **Operations:** Updates `public.users.full_name` and synchronizes Supabase Auth `user_metadata`.
- **Success Response (`200 OK`):**
  ```json
  {
    "user": {
      "id": "11111111-1111-4111-8111-111111111111",
      "email": "alex.morgan@trustvault.io",
      "full_name": "Alexandra Morgan",
      "role": "user",
      "is_active": true,
      "created_at": "2026-10-20T08:30:00.000Z"
    }
  }
  ```
- **Errors:**
  - `400 Bad Request`: Missing `full_name` or attempting to modify forbidden fields.

---

## 4. Document Management Endpoints

### `GET /api/documents`
Lists documents accessible to the authenticated user (both owned documents and documents actively shared with them).

- **Authentication:** `Bearer <token>`.
- **Role Required:** Any active user.
- **Query Parameters:**
  - `q` or `search` *(string, optional)*: Case-insensitive search across title, category, description, owner name, and owner email.
  - `view` *(string, optional)*: Filter scope:
    - `all` *(default)*: All owned and shared documents.
    - `owned` or `my-documents`: Only documents owned by the caller.
    - `shared` or `shared-with-me`: Only documents shared with the caller.
- **Operations:** SQL query joining `documents`, `users`, and active grants from `document_permissions`.
- **Success Response (`200 OK`):**
  ```json
  {
    "documents": [
      {
        "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "owner_id": "11111111-1111-4111-8111-111111111111",
        "owner_email": "alex.morgan@trustvault.io",
        "owner_name": "Alex Morgan",
        "title": "Board_Meeting_Minutes_Q3.pdf",
        "category": "Corporate Governance",
        "description": "Approved executive session minutes",
        "mime_type": "application/pdf",
        "size_bytes": 245890,
        "created_at": "2026-10-24T09:15:00.000Z",
        "updated_at": "2026-10-24T09:15:00.000Z",
        "shared_at": null,
        "access_level": "owner"
      }
    ]
  }
  ```

---

### `POST /api/documents`
Uploads a document file with binary validation and metadata or creates a metadata-only document.

#### Branch A: Multipart File Upload (`multipart/form-data`)
- **Headers:** `Content-Type: multipart/form-data`
- **Form Fields:**
  - `file`: Binary file upload (max 10 MB).
  - `title` *(string, optional)*: Document title (1–200 characters). If omitted, derived safely from `file.originalname`.
  - `category` *(string, required)*: Category tag (1–100 characters).
  - `description` *(string, optional)*: Description (max 1000 characters).
- **Validation Rules:**
  - MIME type must be one of: `application/pdf`, `image/png`, `image/jpeg`, `image/webp`, `text/plain`, `text/csv`.
  - Magic-byte verification enforces declared format (e.g. `%PDF-` for PDF, `89 50 4E 47` for PNG).
  - Text and CSV files are checked for UTF-8 validity and rejection of binary null bytes (`0x00`).
- **Storage & Database Operations:**
  1. Uploads file to Supabase private storage under unpredictable server key: `private/${userId}/${uuid}.${ext}`.
  2. Opens SQL transaction to insert document record and write `file:upload` audit log.
  3. Executes compensating storage cleanup if database insertion fails.
- **Success Response (`201 Created`):**
  ```json
  {
    "document": {
      "id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      "owner_id": "11111111-1111-4111-8111-111111111111",
      "title": "Financial_Audit_2026.pdf",
      "category": "Finance",
      "description": "Annual independent auditor report",
      "mime_type": "application/pdf",
      "size_bytes": 1048576,
      "created_at": "2026-10-24T10:00:00.000Z",
      "updated_at": "2026-10-24T10:00:00.000Z",
      "access_level": "owner"
    }
  }
  ```
- **Errors:**
  - `400 Bad Request`: Missing category, invalid title length, MIME/magic-byte mismatch.
  - `413 Payload Too Large`: File exceeds 10 MB limit.

---

### `GET /api/documents/:id`
Retrieves metadata for a single document.

- **Authentication:** `Bearer <token>`.
- **Role Required:** Document Owner, or an active grantee with `edit` or `read` permission.
- **Path Parameters:**
  - `id`: Document UUID.
- **Success Response (`200 OK`):**
  ```json
  {
    "document": {
      "id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      "owner_id": "11111111-1111-4111-8111-111111111111",
      "owner_email": "alex.morgan@trustvault.io",
      "owner_name": "Alex Morgan",
      "title": "Financial_Audit_2026.pdf",
      "category": "Finance",
      "description": "Annual independent auditor report",
      "mime_type": "application/pdf",
      "size_bytes": 1048576,
      "created_at": "2026-10-24T10:00:00.000Z",
      "updated_at": "2026-10-24T10:00:00.000Z",
      "access_level": "owner"
    }
  }
  ```
- **Errors:**
  - `400 Bad Request`: Invalid UUID format.
  - `404 Not Found`: Non-disclosure response if document does not exist or caller lacks permission.

---

### `GET /api/documents/:id/download`
Authorizes access and streams the file binary from private object storage.

- **Authentication:** `Bearer <token>`.
- **Role Required:** Document Owner, or active grantee with `edit` or `read` permission.
- **Path Parameters:**
  - `id`: Document UUID.
- **Operations:**
  - Verifies active access in PostgreSQL (`revoked_at IS NULL`).
  - Downloads binary stream from `trustvault-private` bucket in Supabase Storage.
  - Sets response headers:
    - `Content-Type`: File MIME type (e.g., `application/pdf`).
    - `Content-Disposition`: RFC 6266 / RFC 5987 compliant attachment header (e.g. `attachment; filename="...pdf"; filename*=UTF-8''...`).
    - `X-Content-Type-Options: nosniff`.
  - Records `file:download` audit log upon stream completion.
- **Success Response (`200 OK`):**
  - Binary file stream.
- **Errors:**
  - `404 Not Found`: Returned if document does not exist, caller lacks permission, access has been revoked, or document has no associated file.

---

### `PATCH /api/documents/:id`
Updates document metadata (`title`, `category`, `description`).

- **Authentication:** `Bearer <token>`.
- **Role Required:** Document Owner or active Editor (`edit`).
- **Path Parameters:**
  - `id`: Document UUID.
- **Request Body (`application/json`):**
  ```json
  {
    "title": "Revised_Financial_Audit_2026.pdf",
    "category": "Audit & Compliance",
    "description": "Updated report with Q4 adjustments"
  }
  ```
- **Validation Rules:**
  - `title` *(optional)*: 1–200 characters.
  - `category` *(optional)*: 1–100 characters.
  - `description` *(optional)*: Max 1000 characters, or `null` / empty string to remove.
  - Immutable fields (`id`, `owner_id`, `storage_key`, `mime_type`, `size_bytes`, `created_at`, `updated_at`, `deleted_at`) return `400 Bad Request`.
- **Success Response (`200 OK`):**
  ```json
  {
    "document": {
      "id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      "owner_id": "11111111-1111-4111-8111-111111111111",
      "title": "Revised_Financial_Audit_2026.pdf",
      "category": "Audit & Compliance",
      "description": "Updated report with Q4 adjustments",
      "mime_type": "application/pdf",
      "size_bytes": 1048576,
      "created_at": "2026-10-24T10:00:00.000Z",
      "updated_at": "2026-10-24T10:30:00.000Z",
      "access_level": "owner"
    }
  }
  ```
- **Errors:**
  - `403 Forbidden`: Caller has `read` permission only (`Insufficient permissions: read-only users cannot edit document metadata`).
  - `404 Not Found`: Document not found or caller has no access.

---

### `DELETE /api/documents/:id`
Soft-deletes a document record.

- **Authentication:** `Bearer <token>`.
- **Role Required:** Strictly restricted to the **Document Owner** (`owner_id === req.user.id`).
- **Path Parameters:**
  - `id`: Document UUID.
- **Operations:** Sets `deleted_at = now()` and writes `document:delete` audit log in an atomic transaction.
- **Success Response (`200 OK`):**
  ```json
  {
    "message": "Document deleted successfully"
  }
  ```
- **Errors:**
  - `403 Forbidden`: Non-owner attempts deletion (`Only the document owner can delete this document`).
  - `404 Not Found`: Document does not exist or was already deleted.

---

## 5. Sharing & Permissions Endpoints

### `GET /api/documents/:id/permissions`
Lists all active permission grants for a document.

- **Authentication:** `Bearer <token>`.
- **Role Required:** Strictly restricted to the **Document Owner**.
- **Path Parameters:**
  - `id`: Document UUID.
- **Success Response (`200 OK`):**
  ```json
  {
    "permissions": [
      {
        "id": "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        "document_id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        "user_id": "22222222-2222-4222-8222-222222222222",
        "user_email": "sam.taylor@trustvault.io",
        "permission": "edit",
        "granted_by": "11111111-1111-4111-8111-111111111111",
        "granted_at": "2026-10-24T10:15:00.000Z"
      }
    ]
  }
  ```
- **Errors:**
  - `403 Forbidden`: Non-owner attempts to view permissions.
  - `404 Not Found`: Document not found.

---

### `POST /api/documents/:id/permissions`
Grants `read` or `edit` permission to a TrustVault user.

- **Authentication:** `Bearer <token>`.
- **Role Required:** Strictly restricted to the **Document Owner**.
- **Path Parameters:**
  - `id`: Document UUID.
- **Request Body (`application/json`):**
  ```json
  {
    "email": "sam.taylor@trustvault.io",
    "permission": "edit"
  }
  ```
  *(or specify `"user_id": "22222222-..."` directly)*
- **Validation Rules:**
  - `permission`: Must be `"read"` or `"edit"`.
  - Target user must exist and have `is_active = true`.
  - Cannot grant permissions to yourself or the document owner (`400 Bad Request`).
  - If target user already has an active grant, returns `409 Conflict` (owner must revoke or update the existing grant).
- **Success Response (`201 Created`):**
  ```json
  {
    "permission": {
      "id": "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      "document_id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      "user_id": "22222222-2222-4222-8222-222222222222",
      "user_email": "sam.taylor@trustvault.io",
      "permission": "edit",
      "granted_by": "11111111-1111-4111-8111-111111111111",
      "granted_at": "2026-10-24T10:15:00.000Z"
    }
  }
  ```
- **Errors:**
  - `400 Bad Request`: Self-grant attempt or invalid permission.
  - `403 Forbidden`: Non-owner attempts to grant permissions.
  - `404 Not Found`: Target user not found or document not found.
  - `409 Conflict`: Target user already has an active permission grant.

---

### `PATCH /api/documents/:id/permissions/:userId`
Updates an existing active grant between `read` and `edit`.

- **Authentication:** `Bearer <token>`.
- **Role Required:** Strictly restricted to the **Document Owner**.
- **Path Parameters:**
  - `id`: Document UUID.
  - `userId`: Target user UUID.
- **Request Body (`application/json`):**
  ```json
  {
    "permission": "read"
  }
  ```
- **Success Response (`200 OK`):**
  ```json
  {
    "permission": {
      "id": "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      "document_id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      "user_id": "22222222-2222-4222-8222-222222222222",
      "user_email": "sam.taylor@trustvault.io",
      "permission": "read",
      "granted_by": "11111111-1111-4111-8111-111111111111",
      "granted_at": "2026-10-24T10:15:00.000Z"
    }
  }
  ```

---

### `DELETE /api/documents/:id/permissions/:userId`
Revokes an active permission grant. Takes effect **immediately** on the subsequent request.

- **Authentication:** `Bearer <token>`.
- **Role Required:** Strictly restricted to the **Document Owner**.
- **Path Parameters:**
  - `id`: Document UUID.
  - `userId`: Target user UUID.
- **Operations:** Updates grant setting `revoked_at = now()` and writes `permission:revoke` audit log.
- **Success Response (`200 OK`):**
  ```json
  {
    "message": "Permission revoked successfully"
  }
  ```
- **Errors:**
  - `403 Forbidden`: Non-owner attempts revocation.
  - `404 Not Found`: No active grant found for the target user.

---

## 6. Audit & Activity Endpoints

### `GET /api/documents/activity`
Retrieves activity logs for documents owned by the authenticated caller. Strictly enforces document-level authorization: users never see audit events for documents owned by others.

- **Authentication:** `Bearer <token>`.
- **Role Required:** Any authenticated document owner.
- **Query Parameters:**
  - `document_id` *(UUID, optional)*: Filter events for a specific document (must be owned by caller).
  - `limit` *(integer, optional, default: 50, max: 100)*: Number of logs to return.
  - `offset` *(integer, optional, default: 0)*: Pagination offset.
- **Success Response (`200 OK`):**
  ```json
  {
    "logs": [
      {
        "id": 142,
        "actor_id": "22222222-2222-4222-8222-222222222222",
        "actor_email": "sam.taylor@trustvault.io",
        "actor_name": "Sam Taylor",
        "document_id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        "document_title": "Financial_Audit_2026.pdf",
        "action": "file:download",
        "outcome": "success",
        "details": { "size_bytes": 1048576 },
        "created_at": "2026-10-24T10:45:00.000Z"
      }
    ]
  }
  ```

---

### `GET /api/admin/audit-logs`
Administrative endpoint to query the global immutable audit log trail across all documents and users.

- **Authentication:** `Bearer <token>`.
- **Role Required:** Strictly restricted to verified **Administrators** (`req.user.role === 'admin'`).
- **Query Parameters:**
  - `limit` *(integer 1–100, default: 50)*: Page size.
  - `offset` *(integer >= 0, default: 0)*: Records to skip.
  - `actor_id` *(UUID, optional)*: Filter by user who performed the action.
  - `document_id` *(UUID, optional)*: Filter by target document.
  - `action` *(string, optional, 1–100 chars)*: Filter by action type (`file:upload`, `file:download`, `document:update`, `permission:grant`, etc.).
  - `outcome` *(string, optional)*: Filter by outcome (`success`, `denied`, `failure`).
  - `start_date` *(ISO 8601 string, optional)*: Inclusive start timestamp.
  - `end_date` *(ISO 8601 string, optional)*: Inclusive end timestamp.
- **Operations:** Queries `public.audit_logs` with parameterized filters. Stable ordering: `created_at DESC, id DESC`.
- **Success Response (`200 OK`):**
  ```json
  {
    "logs": [
      {
        "id": 284,
        "actor_id": "11111111-1111-4111-8111-111111111111",
        "actor_email": "alex.morgan@trustvault.io",
        "actor_name": "Alex Morgan",
        "document_id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        "document_title": "Financial_Audit_2026.pdf",
        "action": "permission:grant",
        "outcome": "success",
        "details": {
          "targetUserId": "22222222-2222-4222-8222-222222222222",
          "targetEmail": "sam.taylor@trustvault.io",
          "permission": "edit"
        },
        "created_at": "2026-10-24T10:15:00.000Z"
      }
    ],
    "pagination": {
      "total": 1,
      "limit": 50,
      "offset": 0,
      "has_more": false
    }
  }
  ```
- **Errors:**
  - `401 Unauthorized`: Authentication required.
  - `403 Forbidden`: Non-admin caller (`Only administrators can access audit logs`). A denied audit event (`audit_log:read`, `denied`) is logged automatically.
