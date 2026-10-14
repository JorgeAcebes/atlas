---
name: media-and-experiences
description: >-
  Use this skill whenever working with photo processing, image compression (Sharp, canvas), media uploads, photo cropping, custom experiences, sub-item tracking, or gallery views in the 47 Picos project.
---

# Media Optimization and Experiences System

This skill covers photo optimization pipelines and the custom/predefined experiences tracking architecture in **47 Picos y 196 Países**.

---

## 1. Media Processing & Image Optimization

### Client-Side Compression & Cropping
- **Cropping Component**: `components/photo-editor.tsx` (utilizes `react-image-crop`).
- **In-Browser Compression**: `lib/image-utils.ts` -> `compressImage(file, maxWidthPx = 1200, quality = 0.75)`.
- **Flow**:
  1. User selects a photo (raw camera photo can be 10-20MB).
  2. Canvas scales down the image to a max dimension of 1200px and converts to JPEG at 75% quality.
  3. Requests presigned upload URL from `/api/photos/upload-intent` (with hard 9.5 GB cap check) and uploads compressed Blob directly to Cloudflare R2 (`atlas-photos/[user_id]/[filename]`).
  4. Inserts row into `public.summit_photos` with `storage_path`, `public_url`, `file_size`, `taken_on`, and `caption`.

### Batch Server-Side Compression
- **Script**: `scripts/compress-existing-photos.mjs`
- **Library**: `sharp`
- **Purpose**: Scans `summit-photos` bucket for any photos > 250 KB and compresses them in-place with Sharp.
- **Execution**:
  ```bash
  node scripts/compress-existing-photos.mjs
  ```

---

## 2. Experiences Architecture

The experience tracking system allows users to check off personal achievements beyond mountains and countries.

### Predefined vs. Custom Experiences

Type | Definition Location | DB Table for Definitions | DB Table for Completions
:--- | :--- | :--- | :---
**Predefined** | `data/experiences.ts` (`predefinedCategories`) | _None (code-level)_ | `experience_records` (`experience_id: "exp-xxx"`)
**Custom Category** | User-created in UI | `custom_experience_categories` | -
**Custom Experience** | User-created in UI | `custom_experiences` | `experience_records` (`experience_id: uuid`)

### Multi-Item / Sub-Item Experiences
Certain experiences consist of sub-items that can be completed individually (e.g. `exp-big-five-land` with Lion, Elephant, Leopard, Rhino, Buffalo):
- Sub-item completions are persisted in `experience_records.sub_items` as a JSONB array of strings: `["lion", "rhino"]`.
- UI renders checkboxes for each sub-item. The experience is considered fully achieved once all sub-items are ticked.

### External Links & Route Tracks
Ascents, visits, and experience records support an optional `link` column (migrations 018 and 020):
- Stores URLs to external activities (Wikiloc, Strava, Komoot, AllTrails).
- Validated in UI with clickable icons.

For complete structure and data models, see [Experiences Reference Guide](./references/experiences-guide.md).

---

## 3. Automated Verification

Run tests covering experiences and image compression:
```bash
npm test tests/unit/experiences.test.ts
npm test tests/unit/image-utils.test.ts
```
