# TrustVault — User Guide & Workflows

TrustVault is a secure, auditable document management platform designed to provide strict per-document access control, verifiable audit trails, and private storage delivery.

This guide explains how to use the TrustVault web interface and its core features.

---

## 1. Authentication & Account Management

### 1.1 Creating an Account (Sign Up)
1. Navigate to the TrustVault homepage and click **Sign up**.
2. Enter your **Full Name**, **Work Email Address**, and a secure **Password** (minimum 6 characters).
3. Click **Create account**.
4. If your email requires confirmation, an activation link will be sent to your email inbox. Once confirmed, you can sign in.

### 1.2 Signing In
1. On the **Login** screen, enter your registered **Email Address** and **Password**.
2. Click **Sign in**.
3. Upon successful authentication, your secure session is established and you are redirected to the TrustVault dashboard.

### 1.3 In-App Password Change
1. Click your profile avatar or name in the upper-right corner of the application header or navigate to **Settings**.
2. Select **Change Password** from the dropdown menu.
3. In the modal dialog:
   - Enter your **New Password** (minimum 6 characters).
   - Re-enter the password in **Confirm New Password**.
4. Click **Update Password**. Your password is updated immediately without requiring an email reset link.

### 1.4 Profile Name Update
1. Navigate to **Settings** in the left sidebar.
2. In the **Profile Information** card, edit your **Full Name**.
3. Click **Save Changes**. Your name updates across the application header, activity trails, and document lists.

---

## 2. Global User Roles & Document Permissions

TrustVault uses a dual-layer permission model:

### 2.1 Global Account Roles (`public.users.role`)

Every registered user has an account-level global role:

| Global Role | Purpose & Permissions | Restrictions |
|---|---|---|
| **Admin (`admin`)** | System oversight & compliance monitoring. Exclusive access to the system-wide Admin Audit Logs (`/admin`). | Cannot download or manipulate user documents unless granted document-level access. |
| **Owner (`owner`)** *(default)* | Standard vault user. Can upload documents, edit and manage owned files, grant/revoke sharing permissions, and view audit trails for owned documents. | Access restricted to documents they created or were shared with. |
| **Viewer (`viewer`)** | Read-only collaborator. Can view and download documents explicitly shared with their account. | **Strictly prohibited** from uploading documents, modifying metadata, deleting documents, or sharing files. Upload buttons and action menus are hidden in the UI; direct API attempts return `403 Forbidden`. |
| **User (`user`)** *(legacy)* | Backward-compatible alias for existing accounts; behaves identically to `owner`. | None. |

### 2.2 Document-Level Permissions

Regardless of global role, document permissions determine access to individual files:

| Permission / Action | Owner | Editor | Reader |
|---|:---:|:---:|:---:|
| **View Document in List** | Yes | Yes | Yes |
| **Download Original File** | Yes | Yes | Yes |
| **View Document Details & Description** | Yes | Yes | Yes |
| **Edit Document Title (Rename)** | Yes | Yes | No |
| **Edit Category & Description** | Yes | Yes | No |
| **Share Document (Grant Permissions)** | Yes | No | No |
| **Revoke Access for Collaborators** | Yes | No | No |
| **View Active Permissions List** | Yes | No | No |
| **Soft-Delete Document** | Yes | No | No |
| **View Document Audit Activity Trail** | Yes | No | No |

> **Security Rule:** A user with global `viewer` role cannot be granted document editing or sharing capabilities; their global role strictly bounds them to read-only capabilities. Similarly, having a global `owner` role does not grant automatic access to documents owned by other users.

---

## 3. Working with Documents

### 3.1 Uploading a Document
1. Click the **Upload Document** button in the dashboard header or sidebar navigation.
2. In the upload modal:
   - **File Selection:** Drag and drop a file or click to browse.
     - *Supported formats:* PDF (`.pdf`), Images (`.png`, `.jpg`, `.jpeg`, `.webp`), Plain Text (`.txt`), and Data (`.csv`).
     - *Maximum file size:* **10 MB**.
   - **Document Title:** Optional. If left blank, the original filename is sanitized and used automatically.
   - **Category:** Select a predefined category (e.g., *Financial*, *Legal*, *Contracts*, *HR*, *Engineering*) or type a custom category.
   - **Description:** Optional explanatory text (up to 1000 characters).
3. Click **Upload & Secure**. The document is verified, stored in the private object vault, and indexed immediately.

### 3.2 Searching and Filtering Documents
- **Global Search Bar:** Enter any search keyword in the top search input. Searches across document titles, categories, descriptions, owner names, and owner emails with instant results.
- **Category Filter Pills:** Click any category tag above the document list (e.g., *All*, *Legal*, *Financial*) to narrow down the view.
- **View Filter:** Use the scope tabs to switch between:
  - **All Documents:** Everything you own or have access to.
  - **My Documents:** Documents uploaded and owned by you.
  - **Shared with Me:** Documents shared with you by other users.
- **View Mode Switcher:** Toggle between **Table View** (compact list with file sizes and dates) and **Grid View** (card-based view with category tags and descriptions).
- **Manual Refresh:** Click the **Refresh** button beside the search bar to poll the backend for any newly shared documents or permission updates.

### 3.3 Downloading a Document
- In the document list or card, click the **Download** button.
- The server validates your current permissions against the database, retrieves the file from private storage, and initiates the download with a clean, sanitized filename.

### 3.4 Editing Document Details (Owner or Editor)
1. Click the three-dot (`⋮`) overflow menu button next to the document.
2. Select **Edit Details** or **Rename**:
   - **Rename:** Quickly update the title.
   - **Edit Details:** Modify the title, category, and descriptive summary.
3. Click **Save Changes**. The updated metadata is committed and an audit entry is recorded.

### 3.5 Deleting a Document (Owner Only)
1. Click the three-dot (`⋮`) overflow menu button.
2. Select **Delete** (highlighted in red).
3. Confirm the deletion in the prompt dialog. The document is soft-deleted and removed from all collaborator lists.

---

## 4. Sharing & Access Control

### 4.1 Sharing with a Collaborator (Owner Only)
1. On any owned document, click the **Share** button.
2. In the **Share Document** modal:
   - Enter the collaborator's **Email Address** (they must be an active TrustVault user).
   - Choose their access level:
     - **Reader:** Can view metadata and download the file.
     - **Editor:** Can view, download, and edit document title, category, and description.
3. Click **Grant Access**. The collaborator will immediately see the document in their **Shared with Me** view.

### 4.2 Updating or Revoking Access
1. Open the **Share** modal on your owned document.
2. Under **Active Access Grants**, find the collaborator's entry:
   - **Change Role:** Use the dropdown to switch between *Reader* and *Editor*.
   - **Revoke:** Click the **Revoke** button (trash icon).
3. Access is revoked **immediately**. If the user attempts to view or download the file again, the request is denied with `404 Document not found`.

---

## 5. Audit Activity & Administration

### 5.1 Document Activity Logs (Document Owners)
- Click **Activity Logs** in the sidebar.
- Displays an operational timeline of all events relating to documents you own:
  - File uploads and downloads.
  - Metadata updates and renames.
  - Permission grants, changes, and revocations.
  - Deleted documents.

### 5.2 Administrative Audit Logs (Administrators Only)
- Users with the verified `admin` role have access to the **Admin Audit Logs** section.
- Features include:
  - Global event stream across all system users and documents.
  - Filtering by **Actor ID**, **Document ID**, **Action Type** (e.g., `file:upload`, `file:download`, `permission:grant`), and **Outcome** (`success`, `denied`, `failure`).
  - Date-range filtering by start and end timestamps.
  - Pagination controls.

---

## 6. Judge Demo Accounts & Role Verification Guide

Three dedicated demo accounts are configured for hackathon judges to verify the three distinct global roles:

| Role | Demo Email | Primary Verification Action |
|---|---|---|
| **Admin Demo** | `demo.admin@trustvault.local` | Audit console oversight (`/admin`) and tenant logs |
| **Owner Demo** | `demo.owner@trustvault.local` | Uploading, managing, and sharing owned documents |
| **Viewer Demo** | `demo.viewer@trustvault.local` | Read-only viewing and downloading; strictly denied from upload/edit/delete/share |

### 6.1 Configuring Demo Account Credentials
Demo passwords are supplied at runtime via environment variables outside of source control. All three distinct passwords and the enable flag are required:

```powershell
$env:ENABLE_DEMO_ACCOUNTS="true"
$env:DEMO_ADMIN_PASSWORD="AdminSecurePassword123!"
$env:DEMO_OWNER_PASSWORD="OwnerSecurePassword123!"
$env:DEMO_VIEWER_PASSWORD="ViewerSecurePassword123!"

npm run seed:judge-accounts
```

### 6.2 Step-by-Step Judge Verification Checklist

#### Test 1: Verify Admin Capabilities
1. Sign in as `demo.admin@trustvault.local`.
2. Notice the **Administrator** badge in the header and the **Admin Console** tab in the sidebar.
3. Click **Admin Console** (`/admin`).
4. Verify that you can view system-wide audit logs across all users with actor IDs, document IDs, action types, and outcomes.
5. Attempt to access a private document belonging to another user without an explicit sharing grant; confirm that the system enforces non-disclosure (`404 Not Found`).

#### Test 2: Verify Owner Capabilities
1. Sign in as `demo.owner@trustvault.local`.
2. Confirm the header badge displays **Document Owner**.
3. Click **Upload Document** and upload a PDF or image file.
4. Verify the document appears in **My Documents**.
5. Click the three-dot (`⋮`) menu and select **Edit Details** to modify the title, category, or description.
6. Click **Share** on your uploaded document, enter `demo.viewer@trustvault.local`, and grant **Can view** (`read`) permission.
7. Click **Activity Logs** in the sidebar to review the operational audit trail for your documents.

#### Test 3: Verify Viewer Restrictions
1. Sign in as `demo.viewer@trustvault.local`.
2. Confirm the header badge displays **Viewer**.
3. **Verify UI Restrictions:**
   - The **Upload Document** button is absent from the header, sidebar, and dashboard banner.
   - In the document list, the three-dot (`⋮`) action menu (Edit, Rename, Delete, Share) is absent.
4. **Verify Permitted Read Access:**
   - The document shared by the Owner appears in the list.
   - Click **Download** and confirm the file downloads successfully.
5. **Verify Server-Side Enforcement (API Tampering Prevention):**
   - Using browser dev tools or curl/Postman with the Viewer's bearer token, attempt to POST a new document to `/api/documents`.
   - Result: The server strictly rejects the request with **403 Forbidden** (`{"error": "Forbidden: Viewers are not authorized to upload documents"}`).
   - Attempt to call `PATCH /api/documents/:id` or `DELETE /api/documents/:id`.
   - Result: The server rejects the request with **403 Forbidden** and logs an access denied audit event.
