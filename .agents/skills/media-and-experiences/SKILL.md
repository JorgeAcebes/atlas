---
name: media-and-experiences
description: >-
  Use this skill whenever working with photo processing, image compression, Cloudflare R2 uploads,
  photo security, lightbox/editor views, custom experiences, sub-item tracking, or companions in Atlas.
---

# Media Optimization and Experiences System

This skill covers photo pipelines (Cloudflare R2 + browser compression), lightbox/editor UX, and the predefined/custom experiences architecture in **Atlas (47 Picos & 196 Países)**.

---

## 1. Media Processing, R2 Storage & Security

### Client-Side Compression, Cropping & Display (`lib/image-utils.ts`, `lib/photo-client.ts`)
- **Cropping & Transform**: `components/photo-editor.tsx` (`react-image-crop`). Toolbar buttons (*"Rotar"*, *"Espejo H"*, *"Espejo V"*, *"Restablecer"*) must remain single-line (`white-space: nowrap`) on all viewports.
- **In-Browser Compression**: `compressImage(file, maxWidthPx = 1200, quality = 0.75)` scales images down via HTML5 Canvas before upload.
- **Browser Upload Flow**:
  1. `uploadPhotoBlob` / `uploadPhotoBlobsBatch` (`lib/photo-client.ts`) chunks compressed blobs (`<= 3.5 MB` and `<= 4` files per request to respect Vercel payload limits) and POSTs to `/api/photos/upload` with the Supabase Bearer token.
  2. Server validates image magic bytes (`detectSafeImageMime` in `lib/photo-security.ts`), checks the strict **9.5 GiB** R2 storage cap (`checkStorageLimit` in `lib/r2-storage.ts`), and uploads to Cloudflare R2 (`atlas-photos`).
  3. Client inserts metadata into `public.summit_photos` (`storage_path`, `public_url`, `file_size`, `taken_on`, `shot_at`, `caption`).
- **REST API v1 / MCP Upload Flow**: Uses `/api/v1/photos/upload-intent` (presigned R2 PUT) followed by `/api/v1/photos/confirm`.
- **Delivery & Caching**: `getPhotoDisplayUrl()` routes `.r2.dev`, legacy Supabase URLs, and paths through `NEXT_PUBLIC_R2_CUSTOM_DOMAIN` or `/api/photos/view/[...path]` (cached by Service Worker `public/sw.js`).
- **Lightbox (`components/photo-lightbox.tsx`)**: Pure `#000000` background, independent flex `.lightbox-stage` + `.lightbox-footer` (no title/image overlap), zoom/pan support, closes only via `X` button, `Escape`, or `popstate` (never backdrop click), and **never displays photo dates**.

### Legacy Supabase Batch Script
- `scripts/compress-existing-photos.mjs` targets historical objects in the legacy Supabase `summit-photos` storage bucket (> 250 KB) using `sharp`.

---

## 2. Experiences Architecture (`data/experiences.ts`, `hooks/use-custom-experiences.ts`)

### Predefined vs. Custom Experiences

| Type | Definition Location | DB Table for Definitions | DB Table for Completions |
| :--- | :--- | :--- | :--- |
| **Predefined** | `data/experiences.ts` (`predefinedCategories`) | _None (immutable in code)_ | `experience_records` (`experience_id: "exp-xxx"`) |
| **Custom Category** | User-created in UI | `custom_experience_categories` | - |
| **Custom Experience** | User-created in UI | `custom_experiences` | `experience_records` (`experience_id: uuid`) |
| **Hidden Default** | User-trashed in UI | `hidden_items` | - |

- Default categories (`predefinedCategories`) are strictly immutable in name and icon (only cross/trash icon is shown; editing is restricted to `isCustomCat`).
- Experiences mode depends strictly on Countries mode (`enable_countries` / `canShowCountries`).

### Multi-Item / Sub-Item Experiences
- Sub-item completions are stored in `experience_records.sub_items` as a JSONB array of strings (e.g. `["lion", "rhino"]`).
- An experience with sub-items counts as completed **only** when all sub-items are ticked.

### Links & Companions
- Ascents, country visits, and experience records support up to 2 links (`link`/`link_name` and `link_2`/`link_name_2`), with `Footprints` icon for outdoor platforms and dynamic mode placeholders, plus `trip_group_id` / `record_companions` (`lib/companions.ts`).

For full data structures, see [Experiences Reference Guide](./references/experiences-guide.md).

---

## 3. Automated Verification

```bash
npm test tests/unit/experiences.test.ts
npm test tests/unit/image-utils.test.ts
npm test tests/unit/photo-lightbox.test.ts
npm test tests/unit/r2-storage-cap.test.ts
```
