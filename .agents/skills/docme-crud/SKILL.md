---
name: docme-crud-implementation
description: Guidelines and architectural trace for implementing CRUD service functions and hooks for Doc, DocVersion, and Page schemas.
---

# Docme CRUD Implementation Skill

This skill provides the architectural trace and guidelines for implementing CRUD operations across `Doc`, `DocVersion`, and `Page` schemas. It enforces a two-layer architecture using service functions and hooks.

## Schemas Overview

Based on the GraphQL API:
- **Doc**: `ItemId`, `CreatedDate`, `LastUpdatedDate`, `CreatedBy`, `Language`, `LastUpdatedBy`, `OrganizationId`, `Tags`, `Name`, `Description`, `CurrentVersion`
- **DocVersion**: `ItemId`, `CreatedDate`, `LastUpdatedDate`, `CreatedBy`, `Language`, `LastUpdatedBy`, `OrganizationId`, `Tags`, `DocId`, `Version`, `Pages` (array of Page ItemIds), `IsPublished`, `IsActive`
- **Page**: `ItemId`, `CreatedDate`, `LastUpdatedDate`, `CreatedBy`, `Language`, `LastUpdatedBy`, `OrganizationId`, `Tags`, `Title`, `ContentType`, `Content`

### Mutation Response Structure
For all mutations (insert, update, delete) across any schema, expect the following standard response structure (example for `insertPage`):
```json
{
  "data": {
    "insertPage": {
      "acknowledged": true,
      "itemId": "3a594b16-f18a-46d4-9405-9cd959236402",
      "totalImpactedData": 0,
      "message": null
    }
  }
}
```

## Architecture Pattern

The data operations must be split into two distinct layers:
1. **Service Functions**: Pure, unit-level functions that directly execute database/GraphQL queries and mutations (`insert`, `update`, `delete`, `deleteMany`). They operate on a single schema at a time.
2. **Hooks**: Business logic orchestrators. Hooks compose multiple service functions to complete a holistic user action, ensuring data relationships (like updating a version when a page is added) are maintained.

## Implementation Trace: Service Functions

When implementing the service layer, ensure the following operations exist:

### Doc Services
- `createDoc(name, description)`: Inserts a new Doc.
- `getDoc(itemId)`: Fetches a Doc.
- `updateDoc(itemId, updates)`: Updates a Doc.
- `deleteDoc(itemId)`: Deletes a Doc.

### DocVersion Services
- `createDocVersion(docId, version, pages)`: Inserts a new DocVersion.
- `getDocVersion(itemId)`: Fetches a DocVersion.
- `updateDocVersion(itemId, updates)`: Updates a DocVersion.
- `deleteDocVersion(itemId)`: Deletes a specific DocVersion.
- `deleteManyDocVersions(docId)`: Deletes all DocVersions associated with a specific document.

### Page Services
- `createPage(title, type, content)`: Inserts a new Page.
- `getPage(itemId)`: Fetches a Page.
- `updatePage(itemId, updates)`: Updates a Page.
- `deletePage(itemId)`: Deletes a specific Page.
- `deleteManyPages(pageIds)`: Deletes multiple Pages in bulk given an array of IDs.

## Implementation Trace: Hooks

When implementing the hooks layer, follow these compositional traces. Ensure `create`, `get`, `update`, and `delete` exist for all schemas:

### Document Hooks
- **`useGetDoc(docId)`**:
  1. `getDoc(docId)`

- **`useCreateDoc(name, description)`**:
  1. `resDoc = createDoc(name, description)`
  2. `resVersion = createDocVersion(resDoc.itemId, "0.0.1", [])`
  3. `updateDoc(resDoc.itemId, { CurrentVersion: resVersion.itemId })`

- **`useUpdateDoc(docId, updates)`**:
  1. `updateDoc(docId, updates)`

- **`useDeleteDoc(docId)`**:
  1. Fetch all versions for the document to gather a comprehensive list of all associated `pageIds`.
  2. `deleteManyPages(allPageIds)` (Bulk delete all pages across all versions)
  3. `deleteManyDocVersions(docId)` (Bulk delete all versions for this document)
  4. `deleteDoc(docId)`

### DocVersion Hooks
- **`useGetDocVersion(versionId)`**:
  1. `getDocVersion(versionId)`

- **`useCreateDocVersion(docId, version, previousVersion)`**:
  1. `resVersion = createDocVersion(docId, version, previousVersion.Pages)`
  2. `updateDoc(docId, { CurrentVersion: resVersion.itemId })`

- **`useUpdateDocVersion(versionId, updates)`**:
  1. `updateDocVersion(versionId, updates)`

- **`useDeleteDocVersion(versionId)`**:
  1. Fetch version to get `pageIds`
  2. `deleteManyPages(pageIds)`
  3. `deleteDocVersion(versionId)`

- **`usePublishVersion(docId, newVersionId, currentPublishedVersionId)`**:
  1. If `currentPublishedVersionId` exists: `updateDocVersion(currentPublishedVersionId, { IsPublished: false })`
  2. `updateDocVersion(newVersionId, { IsPublished: true })`
  3. `updateDoc(docId, { CurrentVersion: newVersionId })`

- **`useActivateVersion(versionId)`**:
  1. `updateDocVersion(versionId, { IsActive: true })`

- **`useDeactivateVersion(versionId)`**:
  1. `updateDocVersion(versionId, { IsActive: false })`

### Page Hooks
- **`useGetPage(pageId)`**:
  1. `getPage(pageId)`

- **`useAddPage(title, type, content, currentVersion)`**:
  1. `resPage = createPage(title, type, content)`
  2. `newPages = [...currentVersion.Pages, resPage.itemId]`
  3. `updateDocVersion(currentVersion.ItemId, { Pages: newPages })`

- **`useUpdatePage(pageId, updates)`**:
  1. `updatePage(pageId, updates)`

- **`useDeletePage(pageId, currentVersion)`**:
  1. `deletePage(pageId)`
  2. `newPages = currentVersion.Pages.filter(id => id !== pageId)`
  3. `updateDocVersion(currentVersion.ItemId, { Pages: newPages })`
