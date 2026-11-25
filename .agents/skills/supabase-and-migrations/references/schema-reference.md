# Supabase Schema Reference

Detailed documentation of all public tables and storage tracking in **Atlas (47 Picos & 196 Países)** (migrations `001`–`036`).

---

## Tables Overview

### 1. `public.profiles`
User profiles synced with `auth.users`.
- `id` (uuid, PK, references `auth.users.id` on delete cascade)
- `username` (text, unique)
- `display_name` (text)
- `avatar_url` (text)
- `bio` (text)
- `is_public` (boolean, default `true`)
- `is_test` (boolean, not null, default `false`): Excludes test accounts from ranking, feed, search, and recommendations (`023_test_profiles_exclusion.sql`).
- `enable_peaks` (boolean, default `true`)
- `enable_countries` (boolean, default `true`)
- `enable_experiences` (boolean, default `true`; frozen when `enable_countries` is false)
- `created_at` (timestamptz)
- `updated_at` (timestamptz)
- _(Note: `enable_regions` was removed in `027_remove_regions.sql`.)_

### 2. `public.ascents`
Tracks completed Spanish summits and visited world countries.
- `id` (uuid, PK)
- `user_id` (uuid, FK `auth.users.id`)
- `summit_id` (text): Spanish peak id (e.g. `"gorbea"`, `"mulhacen"`) or country id (e.g. `"country-es"`, `"country-fr"`).
- `achieved_on` (date): Start date of ascent or visit.
- `end_date` (date, nullable): Optional completion / departure date (`>= achieved_on`).
- `notes` (text, nullable)
- `link` (text, nullable), `link_name` (text, nullable)
- `link_2` (text, nullable), `link_name_2` (text, nullable)
- `trip_group_id` (uuid, nullable): Shared trip identifier linking companions (`032_record_companions.sql`).
- `created_at`, `updated_at` (timestamptz)

### 3. `public.wishes`
Wishlist entries for mountains or countries users want to visit.
- `id` (uuid, PK)
- `user_id` (uuid, FK `auth.users.id`)
- `summit_id` (text)
- `created_at` (timestamptz)

### 4. `public.summit_photos`
Photo attachments stored in Cloudflare R2 (`atlas-photos`) and associated with summits, countries, or experiences.
- `id` (uuid, PK)
- `user_id` (uuid, FK `auth.users.id`)
- `summit_id` (text)
- `storage_path` (text, unique)
- `public_url` (text)
- `file_size` (bigint, default `0`): Tracked for the 9.5 GiB R2 cap (`get_total_photos_storage_bytes()`).
- `taken_on` (date)
- `shot_at` (timestamptz / text, nullable): Optional capture timestamp (`026_add_shot_at_to_summit_photos.sql`).
- `caption` (text, nullable)
- `created_at` (timestamptz)

### 5. `public.connections`
Social follow / friendship relationships.
- `id` (uuid, PK)
- `follower_id` (uuid, FK `auth.users.id`)
- `following_id` (uuid, FK `auth.users.id`)
- `status` (text: `'pending'`, `'accepted'`, `'rejected'`)
- `created_at` (timestamptz)

### 6. `public.custom_experience_categories`
User-defined experience categories (default `predefinedCategories` are immutable at code level).
- `id` (uuid, PK)
- `static_id` (text, nullable)
- `user_id` (uuid, FK `auth.users.id`)
- `name` (text)
- `icon_name` (text)
- `created_at` (timestamptz)

### 7. `public.custom_experiences`
Individual user-created experiences within a category.
- `id` (uuid, PK)
- `category_id` (uuid, FK `custom_experience_categories.id`)
- `user_id` (uuid, FK `auth.users.id`)
- `name` (text)
- `created_at` (timestamptz)

### 8. `public.experience_records`
Completions of predefined or custom experiences.
- `id` (uuid, PK)
- `user_id` (uuid, FK `auth.users.id`)
- `experience_id` (text): Predefined `exp-xxx` or custom UUID.
- `achieved_on` (date)
- `end_date` (date, nullable)
- `notes` (text, nullable)
- `link` (text, nullable), `link_name` (text, nullable)
- `link_2` (text, nullable), `link_name_2` (text, nullable)
- `sub_items` (jsonb, nullable): e.g. `["lion", "leopard"]` for Big Five.
- `trip_group_id` (uuid, nullable)
- `created_at`, `updated_at` (timestamptz)

### 9. `public.hidden_items`
Allows users to hide/trash specific predefined categories or experiences.
- `id` (uuid, PK)
- `user_id` (uuid, FK `auth.users.id`)
- `item_id` (text): Category or experience identifier.
- `created_at` (timestamptz)

### 10. `public.record_companions` (`032_record_companions.sql`)
Shared trip / experience invitations between mutual followers (`get_mutual_followers()`).
- `id` (uuid, PK), `trip_group_id` (uuid), `inviter_id` (uuid), `companion_id` (uuid)
- `record_type` (`'ascent' | 'experience'`), `item_type` (`'peaks' | 'countries' | 'experience'`), `item_id` (text), `sub_item_id` (text, nullable)
- `inviter_record_id` (uuid), `companion_record_id` (uuid), `location_name` (text)
- `start_date`, `end_date`, `original_start_date`, `original_end_date`, `lat`, `lng`
- `status` (`'pending' | 'accepted' | 'rejected' | 'separated'`)

### 11. `public.api_keys` (`035_api_keys.sql`)
Hashed personal API keys for REST API v1 and MCP server authentication.
- `id` (uuid, PK), `user_id` (uuid), `name` (text), `key_prefix` (text), `key_hash` (text, unique)
- `scopes` (`text[]`: `'read'`, `'photos:write'`, `'records:write'`), `last_used_at`, `expires_at`, `revoked_at`, `created_at`

### 12. `public.push_subscriptions` (`036_push_subscriptions.sql`)
Web Push (VAPID) device subscriptions and notification preferences.
- `id` (uuid, PK), `user_id` (uuid), `endpoint` (text, unique), `p256dh`, `auth`, `user_agent`
- `notify_following_posts` (boolean), `notify_shared_records` (boolean), `created_at`, `updated_at`
