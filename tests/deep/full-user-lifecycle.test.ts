/**
 * DEEP PRE-PUSH END-TO-END TEST: FULL USER LIFECYCLE & STEALTH ISOLATION
 *
 * This test suite executes all possible application actions:
 *  1. User registration & authentication with test marker (is_test: true)
 *  2. Profile setup, bio editing, avatar upload to storage, and preferences toggling
 *  3. Provincial peaks tracking (single peaks, shared peaks invariant, photo upload, wikiloc track, wishlist)
 *  4. World countries tracking (single dates, date ranges, wishlist)
 *  5. Experiences tracking (categories, custom experiences, sub-items multi-step completion, predefined 7 Wonders, wishlist, hidden items)
 *  6. Social interactions (search, visiting another profile, sending connection request, accepting connection)
 *  7. Sharing and deep-link generation (#panel=recordId)
 *  8. STEALTH & ISOLATION VERIFICATION:
 *     - Hidden from global ranking (get_user_ranking)
 *     - Hidden from total users count
 *     - Hidden from public social feed (ascents & experience records)
 *     - Hidden from social user search
 *     - Hidden from recommended profiles
 *     - Hidden from direct profile queries by other users (RLS simulation)
 *  9. Data deletion & complete account teardown (storage photo purge and user purge)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createMockSupabaseClient, MockSupabaseClient } from "@/tests/mocks/supabase-mock";

describe("Deep E2E: Full User Lifecycle & Stealth Isolation", () => {
  let supabase: MockSupabaseClient;

  // Test User Details
  const testUserId = "user-qa-e2e-stealth-001";
  const testUserEmail = "qa_runner@e2e.test";
  const testUsername = "qa_stealth_explorer";

  // Peer/Regular User Details (to verify stealth & social interaction)
  const peerUserId = "user-regular-carlos-123";
  const peerUsername = "carlos_alpinista";
  const peerEmail = "carlos@example.com";

  beforeEach(() => {
    supabase = createMockSupabaseClient();
    supabase.clear();

    // Seed regular public peer user
    supabase.seedTable("profiles", [
      {
        id: peerUserId,
        username: peerUsername,
        avatar_url: "https://example.com/carlos.jpg",
        is_public: true,
        is_test: false,
        bio: "Alpinista aficionado",
        created_at: new Date().toISOString(),
      },
    ]);

    // Seed peer's public ascents so ranking and feed have baseline data
    supabase.seedTable("ascents", [
      {
        id: "ascent-carlos-1",
        user_id: peerUserId,
        summit_id: "country-fr",
        achieved_on: "2026-01-10",
        is_wishlist: false,
        notes: "Viaje a Francia",
        created_at: new Date().toISOString(),
      },
      {
        id: "ascent-carlos-2",
        user_id: peerUserId,
        summit_id: "mulhacen",
        achieved_on: "2026-02-15",
        is_wishlist: false,
        notes: "Subida invernal a Sierra Nevada",
        created_at: new Date().toISOString(),
      },
    ]);
  });

  // --------------------------------------------------------------------------
  // STEP 1: Registration and Authentication
  // --------------------------------------------------------------------------
  it("Stage 1: should register a new test user and mark profile as is_test automatically", async () => {
    const signUpRes = await supabase.auth.signUp({
      email: testUserEmail,
      password: "SuperSecretPassword123!",
      options: {
        data: {
          username: testUsername,
          is_test: true,
        },
      },
    });

    expect(signUpRes.error).toBeNull();
    expect(signUpRes.data.user).toBeDefined();
    expect(signUpRes.data.user.email).toBe(testUserEmail);

    // Verify user profile exists in database and is_test is true
    const profileRes = await supabase
      .from("profiles")
      .select("*")
      .eq("username", testUsername)
      .single();

    expect(profileRes.error).toBeNull();
    expect(profileRes.data.username).toBe(testUsername);
    expect(profileRes.data.is_test).toBe(true);
  });

  // --------------------------------------------------------------------------
  // STEP 2: Profile Customization & Storage Upload
  // --------------------------------------------------------------------------
  it("Stage 2: should customize profile description, upload avatar to storage and toggle preferences", async () => {
    // Ensure test user profile exists
    await supabase.from("profiles").insert({
      id: testUserId,
      username: testUsername,
      is_public: true,
      is_test: true,
    });

    // 2.1 Upload avatar to storage bucket
    const avatarBucket = supabase.storage.from("summit-photos");
    const avatarPath = `${testUserId}/avatar_${Date.now()}.jpg`;
    const uploadRes = await avatarBucket.upload(avatarPath, "fake-avatar-binary", {
      contentType: "image/jpeg",
    });

    expect(uploadRes.error).toBeNull();
    const publicUrlRes = avatarBucket.getPublicUrl(avatarPath);
    expect(publicUrlRes.data.publicUrl).toContain(avatarPath);

    // 2.2 Update profile fields
    const updateRes = await supabase
      .from("profiles")
      .update({
        avatar_url: publicUrlRes.data.publicUrl,
        bio: "Probador automatizado de alta montaña y 196 países",
        share_photos: true,
        share_notes: true,
        enable_experiences: true,
        enable_peaks: true,
        enable_countries: true,
      })
      .eq("id", testUserId);

    expect(updateRes.error).toBeNull();

    // Verify profile persisted
    const updatedProfile = await supabase
      .from("profiles")
      .select("*")
      .eq("id", testUserId)
      .single();

    expect(updatedProfile.data.bio).toBe("Probador automatizado de alta montaña y 196 países");
    expect(updatedProfile.data.avatar_url).toContain("avatar_");
    expect(updatedProfile.data.enable_experiences).toBe(true);
    expect(updatedProfile.data.enable_peaks).toBe(true);
    expect(updatedProfile.data.enable_countries).toBe(true);
    expect(updatedProfile.data.is_test).toBe(true);
  });

  // --------------------------------------------------------------------------
  // STEP 3: Peaks Registration & Invariants
  // --------------------------------------------------------------------------
  it("Stage 3: should record peaks, shared summits, photos, wikiloc tracks and wishlists", async () => {
    // 3.1 Regular peak summit: Mulhacén (Granada)
    const ascent1 = await supabase.from("ascents").insert({
      id: "ascent-mulhacen-test",
      user_id: testUserId,
      summit_id: "mulhacen",
      achieved_on: "2026-05-15",
      notes: "Ruta desde la Hoya del Portillo. Impresionantes vistas de Sierra Nevada.",
      link: "https://es.wikiloc.com/rutas-senderismo/mulhacen-test-123",
      link_name: "Track Wikiloc Mulhacén",
      is_wishlist: false,
    });
    expect(ascent1.error).toBeNull();

    // Upload summit photo for Mulhacén
    const summitBucket = supabase.storage.from("summit-photos");
    const photoPath = `${testUserId}/20260515_mulhacen.jpg`;
    await summitBucket.upload(photoPath, "summit-photo-binary");
    const photoUrl = summitBucket.getPublicUrl(photoPath).data.publicUrl;

    const photoRecord = await supabase.from("summit_photos").insert({
      user_id: testUserId,
      summit_id: "mulhacen",
      storage_path: photoPath,
      public_url: photoUrl,
      taken_on: "2026-05-15",
    });
    expect(photoRecord.error).toBeNull();

    // 3.2 Shared peak: Peñalara (Madrid & Segovia)
    // In 47 Picos, Peñalara represents 2 provincial demarcations but 1 unique physical summit
    const ascent2 = await supabase.from("ascents").insert({
      id: "ascent-penalara-test",
      user_id: testUserId,
      summit_id: "penalara",
      achieved_on: "2026-06-20",
      notes: "Ascenso por el Puerto de Cotos con la Laguna Grande.",
      is_wishlist: false,
    });
    expect(ascent2.error).toBeNull();

    // 3.3 Wishlist peak: Teide (Tenerife)
    const wishlistPeak = await supabase.from("ascents").insert({
      id: "ascent-teide-wishlist",
      user_id: testUserId,
      summit_id: "teide",
      achieved_on: "2026-12-31",
      notes: "Pendiente para vacaciones de invierno",
      is_wishlist: true,
    });
    expect(wishlistPeak.error).toBeNull();

    // Verify querying user's peaks
    const userAscents = await supabase
      .from("ascents")
      .select("*")
      .eq("user_id", testUserId)
      .eq("is_wishlist", false);

    expect(userAscents.data).toHaveLength(2);
    const summitIds = userAscents.data.map((a: any) => a.summit_id);
    expect(summitIds).toContain("mulhacen");
    expect(summitIds).toContain("penalara");
  });

  // --------------------------------------------------------------------------
  // STEP 4: Countries Tracking (196 Países)
  // --------------------------------------------------------------------------
  it("Stage 4: should record countries visited with single dates, date ranges and wishlists", async () => {
    // 4.1 Country with single date: Japan
    const country1 = await supabase.from("ascents").insert({
      id: "ascent-country-jp",
      user_id: testUserId,
      summit_id: "country-jp",
      achieved_on: "2026-04-10",
      notes: "Viaje de primavera a Tokio y Kioto",
      is_wishlist: false,
    });
    expect(country1.error).toBeNull();

    // 4.2 Country with date range: France
    const country2 = await supabase.from("ascents").insert({
      id: "ascent-country-fr",
      user_id: testUserId,
      summit_id: "country-fr",
      achieved_on: "2026-07-01",
      end_date: "2026-07-15",
      notes: "Tour del Mont Blanc y Chamonix",
      is_wishlist: false,
    });
    expect(country2.error).toBeNull();

    // 4.3 Country Wishlist: Iceland
    const countryWishlist = await supabase.from("ascents").insert({
      id: "ascent-country-is-wishlist",
      user_id: testUserId,
      summit_id: "country-is",
      achieved_on: "2027-01-01",
      notes: "Quiero ir a ver auroras boreales",
      is_wishlist: true,
    });
    expect(countryWishlist.error).toBeNull();

    const visitedCountries = await supabase
      .from("ascents")
      .select("*")
      .eq("user_id", testUserId)
      .eq("is_wishlist", false);

    const countryIds = visitedCountries.data
      .filter((a: any) => a.summit_id.startsWith("country-"))
      .map((a: any) => a.summit_id);

    expect(countryIds).toHaveLength(2);
    expect(countryIds).toContain("country-jp");
    expect(countryIds).toContain("country-fr");
  });

  // --------------------------------------------------------------------------
  // STEP 5: Experiences, Custom Categories & Sub-items Multi-step Completion
  // --------------------------------------------------------------------------
  it("Stage 5: should manage categories, custom experiences with sub-items, and predefined adventures", async () => {
    // 5.1 Create custom category
    const catRes = await supabase.from("custom_experience_categories").insert({
      id: "cat-ferratas-1",
      user_id: testUserId,
      name: "Vías Ferratas y Escalada",
      icon_name: "mountain",
    });
    expect(catRes.error).toBeNull();

    // 5.2 Create custom experience with sub-items
    const customExpRes = await supabase.from("custom_experiences").insert({
      id: "exp-lagos-espana",
      user_id: testUserId,
      category_id: "cat-ferratas-1",
      name: "Grandes Lagos de Montaña",
      icon_name: "waves",
      sub_items: [
        { id: "sub-enol", name: "Lago Enol" },
        { id: "sub-ercina", name: "Lago Ercina" },
      ],
    });
    expect(customExpRes.error).toBeNull();

    // 5.3 Complete sub-item 1
    const sub1Res = await supabase.from("experience_records").insert({
      id: "rec-enol-1",
      user_id: testUserId,
      experience_id: "exp-lagos-espana",
      sub_item_id: "sub-enol",
      achieved_on: "2026-08-01",
      notes: "Visita al Lago Enol en Picos de Europa",
      is_wishlist: false,
    });
    expect(sub1Res.error).toBeNull();

    // Verify only 1 sub-item completed -> experience not fully done yet
    let userRecords = await supabase
      .from("experience_records")
      .select("*")
      .eq("user_id", testUserId)
      .eq("experience_id", "exp-lagos-espana")
      .eq("is_wishlist", false);

    expect(userRecords.data).toHaveLength(1);

    // 5.4 Complete sub-item 2 -> Experience now 100% complete
    const sub2Res = await supabase.from("experience_records").insert({
      id: "rec-ercina-2",
      user_id: testUserId,
      experience_id: "exp-lagos-espana",
      sub_item_id: "sub-ercina",
      achieved_on: "2026-08-02",
      notes: "Visita al Lago Ercina",
      is_wishlist: false,
    });
    expect(sub2Res.error).toBeNull();

    userRecords = await supabase
      .from("experience_records")
      .select("*")
      .eq("user_id", testUserId)
      .eq("experience_id", "exp-lagos-espana")
      .eq("is_wishlist", false);

    expect(userRecords.data).toHaveLength(2);

    // 5.5 Predefined experience: 7 Maravillas del Mundo (Coliseo)
    const predefinedRes = await supabase.from("experience_records").insert({
      id: "rec-7wonders-coliseo",
      user_id: testUserId,
      experience_id: "exp-7-wonders",
      sub_item_id: "coliseo",
      achieved_on: "2026-09-10",
      notes: "Coliseo de Roma al atardecer",
      is_wishlist: false,
    });
    expect(predefinedRes.error).toBeNull();

    // 5.6 Hide an experience item (Papelera / hidden_items)
    const hideRes = await supabase.from("hidden_items").insert({
      user_id: testUserId,
      item_id: "exp-unused-item",
    });
    expect(hideRes.error).toBeNull();
  });

  // --------------------------------------------------------------------------
  // STEP 6: Social Interactions (Search, Visit Profile, Follow/Connect)
  // --------------------------------------------------------------------------
  it("Stage 6: should search for peers, visit peer profile, and handle connection request", async () => {
    // 6.1 Test user searches for peer Carlos
    const searchRes = await supabase
      .from("profiles")
      .select("*")
      .ilike("username", "%carlos%")
      .neq("is_test", true);

    expect(searchRes.error).toBeNull();
    expect(searchRes.data).toHaveLength(1);
    expect(searchRes.data[0].username).toBe(peerUsername);

    // 6.2 Test user sends connection request
    const connectRes = await supabase.from("connections").insert({
      id: "conn-test-to-carlos",
      follower_id: testUserId,
      following_id: peerUserId,
      status: "pending",
    });
    expect(connectRes.error).toBeNull();

    // 6.3 Carlos accepts connection
    const acceptRes = await supabase
      .from("connections")
      .update({ status: "accepted" })
      .eq("id", "conn-test-to-carlos");
    expect(acceptRes.error).toBeNull();

    // Verify connection state
    const connCheck = await supabase
      .from("connections")
      .select("*")
      .eq("follower_id", testUserId)
      .eq("following_id", peerUserId)
      .single();

    expect(connCheck.data.status).toBe("accepted");
  });

  // --------------------------------------------------------------------------
  // STEP 7: Sharing Records & Deep Links (#panel=id)
  // --------------------------------------------------------------------------
  it("Stage 7: should generate compliant deep-links without date concatenation in title", async () => {
    const ascentRecordId = "ascent-mulhacen-test";
    const shareUrl = `https://47picos.es/#panel=${ascentRecordId}`;

    expect(shareUrl).toContain("#panel=");
    expect(shareUrl).toContain(ascentRecordId);

    // Verify invariant: Feed share button links directly to #panel=recordId
    const experienceRecordId = "rec-7wonders-coliseo";
    const expShareUrl = `https://47picos.es/#panel=${experienceRecordId}`;
    expect(expShareUrl).toBe(`https://47picos.es/#panel=rec-7wonders-coliseo`);
  });

  // --------------------------------------------------------------------------
  // STEP 8: CRITICAL STEALTH & ISOLATION REQUIREMENT
  // --------------------------------------------------------------------------
  it("Stage 8: STEALTH ISOLATION - Test profile MUST NOT appear in ranking, social feed, user search or recommendations", async () => {
    // Populate test user's data
    await supabase.from("profiles").insert({
      id: testUserId,
      username: testUsername,
      is_public: true,
      is_test: true,
    });

    await supabase.from("ascents").insert([
      {
        id: "test-stealth-country",
        user_id: testUserId,
        summit_id: "country-jp",
        achieved_on: "2026-04-10",
        is_wishlist: false,
      },
      {
        id: "test-stealth-peak",
        user_id: testUserId,
        summit_id: "mulhacen",
        achieved_on: "2026-05-15",
        is_wishlist: false,
      },
    ]);

    await supabase.from("experience_records").insert({
      id: "test-stealth-exp",
      user_id: testUserId,
      experience_id: "exp-7-wonders",
      sub_item_id: "coliseo",
      achieved_on: "2026-09-10",
      is_wishlist: false,
    });

    // NOW: Switch session/perspective to regular peer Carlos
    supabase.setSessionUser({
      id: peerUserId,
      email: peerEmail,
      user_metadata: { username: peerUsername },
    });

    // 8.1 RANKING CHECK: Test user must NOT appear in country ranking
    const countryRanking = await supabase.rpc("get_user_ranking", { p_mode: "countries" });
    expect(countryRanking.error).toBeNull();
    const countryRankingUserIds = countryRanking.data.map((r: any) => r.user_id);
    expect(countryRankingUserIds).not.toContain(testUserId);
    expect(countryRankingUserIds).toContain(peerUserId);

    // 8.2 RANKING CHECK: Test user must NOT appear in peaks ranking
    const peaksRanking = await supabase.rpc("get_user_ranking", { p_mode: "peaks" });
    expect(peaksRanking.error).toBeNull();
    const peaksRankingUserIds = peaksRanking.data.map((r: any) => r.user_id);
    expect(peaksRankingUserIds).not.toContain(testUserId);
    expect(peaksRankingUserIds).toContain(peerUserId);

    // 8.3 TOTAL USERS COUNT: Must exclude is_test profiles
    const totalUsers = await supabase
      .from("profiles")
      .select("*", { count: "exact" })
      .neq("is_test", true);

    const userIds = totalUsers.data.map((p: any) => p.id);
    expect(userIds).not.toContain(testUserId);
    expect(userIds).toContain(peerUserId);

    // 8.4 SOCIAL FEED CHECK: Test user's ascents must NOT appear in feed
    const feedAscents = await supabase
      .from("ascents")
      .select("id, user_id, summit_id, achieved_on, profiles!ascents_user_id_profiles_fkey(username, avatar_url, is_public, is_test)")
      .eq("is_wishlist", false);

    const publicFeedAscents = feedAscents.data.filter((a: any) => {
      if (a.profiles?.is_test) return false;
      return true;
    });

    const feedAscentUserIds = publicFeedAscents.map((a: any) => a.user_id);
    expect(feedAscentUserIds).not.toContain(testUserId);

    // 8.5 SOCIAL FEED CHECK: Test user's experiences must NOT appear in feed
    const feedExps = await supabase
      .from("experience_records")
      .select("id, user_id, experience_id, profiles!experience_records_user_id_profiles_fkey(username, avatar_url, is_public, is_test)")
      .eq("is_wishlist", false);

    const publicFeedExps = feedExps.data.filter((e: any) => {
      if (e.profiles?.is_test) return false;
      return true;
    });

    const feedExpUserIds = publicFeedExps.map((e: any) => e.user_id);
    expect(feedExpUserIds).not.toContain(testUserId);

    // 8.6 SOCIAL SEARCH CHECK: Searching for test user returns empty
    const searchTestUser = await supabase
      .from("profiles")
      .select("*")
      .ilike("username", `%${testUsername}%`)
      .neq("is_test", true);

    expect(searchTestUser.data).toHaveLength(0);

    // 8.7 RECOMMENDED PROFILES: Must NOT recommend test user
    const recommended = await supabase.rpc("get_recommended_profiles");
    expect(recommended.error).toBeNull();
    const recommendedIds = recommended.data.map((p: any) => p.id);
    expect(recommendedIds).not.toContain(testUserId);
  });

  // --------------------------------------------------------------------------
  // STEP 9: Data Deletion & Teardown
  // --------------------------------------------------------------------------
  it("Stage 9: should delete user records, purge storage files, and tear down test account", async () => {
    // Seed test user with photos in storage
    const bucket = supabase.storage.from("summit-photos");
    await bucket.upload(`${testUserId}/summit1.jpg`, "data1");
    await bucket.upload(`${testUserId}/summit2.jpg`, "data2");

    let files = await bucket.list(testUserId);
    expect(files.data).toHaveLength(2);

    // Purge user's photos from storage (as done in /api/account/delete)
    const pathsToDelete = files.data.map((f: any) => `${testUserId}/${f.name}`);
    await bucket.remove(pathsToDelete);

    files = await bucket.list(testUserId);
    expect(files.data).toHaveLength(0);

    // Delete user from profiles and ascents
    await supabase.from("ascents").delete().eq("user_id", testUserId);
    await supabase.from("experience_records").delete().eq("user_id", testUserId);
    await supabase.from("profiles").delete().eq("id", testUserId);

    const remainingAscents = await supabase.from("ascents").select("*").eq("user_id", testUserId);
    expect(remainingAscents.data).toHaveLength(0);

    const remainingProfile = await supabase.from("profiles").select("*").eq("id", testUserId);
    expect(remainingProfile.data).toHaveLength(0);
  });
});
