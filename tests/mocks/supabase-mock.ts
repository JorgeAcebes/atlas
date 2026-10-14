/**
 * Supabase In-Memory Mock Client for testing and harness verification
 * Simulates table operations, basic filtering, relations/joins, auth, storage, and RPCs.
 */

export interface MockRecord {
  [key: string]: any;
}

export class MockQueryBuilder {
  private tableName: string;
  private store: Map<string, MockRecord[]>;
  private filters: Array<(row: MockRecord) => boolean> = [];
  private orderCol?: string;
  private ascending = true;
  private limitCount?: number;
  private isSingle = false;
  private pendingInsert?: MockRecord | MockRecord[];
  private pendingUpdate?: Partial<MockRecord>;
  private isDelete = false;

  constructor(tableName: string, store: Map<string, MockRecord[]>) {
    this.tableName = tableName;
    this.store = store;
  }

  private getRows(): MockRecord[] {
    if (!this.store.has(this.tableName)) {
      this.store.set(this.tableName, []);
    }
    return this.store.get(this.tableName)!;
  }

  select(_columns = "*", _options?: { count?: string; head?: boolean }): this {
    return this;
  }

  eq(column: string, value: any): this {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  neq(column: string, value: any): this {
    this.filters.push((row) => row[column] !== value);
    return this;
  }

  in(column: string, values: any[]): this {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }

  ilike(column: string, pattern: string): this {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*");
    const regex = new RegExp(`^${escaped}$`, "i");
    this.filters.push((row) => regex.test(String(row[column] || "")));
    return this;
  }

  or(_query: string): this {
    // Basic permissive simulation for .or() clauses
    return this;
  }

  order(column: string, { ascending = true }: { ascending?: boolean } = {}): this {
    this.orderCol = column;
    this.ascending = ascending;
    return this;
  }

  limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  single(): this {
    this.isSingle = true;
    return this;
  }

  insert(data: MockRecord | MockRecord[]): this {
    this.pendingInsert = data;
    return this;
  }

  update(data: Partial<MockRecord>): this {
    this.pendingUpdate = data;
    return this;
  }

  delete(): this {
    this.isDelete = true;
    return this;
  }

  async then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: any; count?: number }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    const result = this.execute();
    return Promise.resolve(result).then(onfulfilled, onrejected);
  }

  private execute(): { data: any; error: any; count?: number } {
    let rows = this.getRows();

    // Handle INSERT
    if (this.pendingInsert) {
      const items = Array.isArray(this.pendingInsert) ? this.pendingInsert : [this.pendingInsert];
      const inserted = items.map((item) => ({
        id: item.id || `mock-id-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        created_at: new Date().toISOString(),
        ...item,
      }));
      rows.push(...inserted);
      return { data: this.isSingle ? inserted[0] : inserted, error: null, count: inserted.length };
    }

    // Handle UPDATE
    if (this.pendingUpdate) {
      const updatedRows: MockRecord[] = [];
      for (let i = 0; i < rows.length; i++) {
        const matches = this.filters.every((f) => f(rows[i]));
        if (matches) {
          rows[i] = { ...rows[i], ...this.pendingUpdate, updated_at: new Date().toISOString() };
          updatedRows.push(rows[i]);
        }
      }
      return { data: this.isSingle ? updatedRows[0] || null : updatedRows, error: null, count: updatedRows.length };
    }

    // Handle DELETE
    if (this.isDelete) {
      const deletedRows: MockRecord[] = [];
      const remaining: MockRecord[] = [];
      for (const row of rows) {
        if (this.filters.every((f) => f(row))) {
          deletedRows.push(row);
        } else {
          remaining.push(row);
        }
      }
      this.store.set(this.tableName, remaining);
      return { data: deletedRows, error: null, count: deletedRows.length };
    }

    // Handle SELECT
    let filtered = rows.filter((row) => this.filters.every((f) => f(row)));

    // Join profiles if selecting from ascents or experience_records
    if (this.tableName === "ascents" || this.tableName === "experience_records") {
      const profiles = this.store.get("profiles") || [];
      filtered = filtered.map((row) => {
        const userProfile = profiles.find((p) => p.id === row.user_id);
        return {
          ...row,
          profiles: userProfile
            ? {
                username: userProfile.username,
                avatar_url: userProfile.avatar_url,
                is_public: userProfile.is_public,
                is_test: userProfile.is_test || false,
              }
            : null,
        };
      });
    }

    if (this.orderCol) {
      const col = this.orderCol;
      const asc = this.ascending;
      filtered.sort((a, b) => {
        if (a[col] < b[col]) return asc ? -1 : 1;
        if (a[col] > b[col]) return asc ? 1 : -1;
        return 0;
      });
    }

    if (this.limitCount !== undefined) {
      filtered = filtered.slice(0, this.limitCount);
    }

    if (this.isSingle) {
      return {
        data: filtered[0] || null,
        error: filtered.length === 0 ? { message: "Row not found", code: "PGRST116" } : null,
      };
    }

    return { data: filtered, error: null, count: filtered.length };
  }
}

export class MockStorageBucket {
  private files = new Map<string, { data: any; metadata: any }>();

  async upload(filePath: string, fileData: any, options: any = {}) {
    this.files.set(filePath, {
      data: fileData,
      metadata: {
        size: options?.size || 1024,
        mimetype: options?.contentType || "image/jpeg",
      },
    });
    return { data: { path: filePath }, error: null };
  }

  async list(folder = "", _options = {}) {
    const list: Array<{ name: string; id: string | null; metadata?: any }> = [];
    for (const [key, value] of this.files.entries()) {
      if (folder && !key.startsWith(folder)) continue;
      const subPath = folder ? key.slice(folder.length).replace(/^\//, "") : key;
      list.push({
        name: subPath,
        id: subPath,
        metadata: value.metadata,
      });
    }
    return { data: list, error: null };
  }

  getPublicUrl(path: string) {
    return {
      data: {
        publicUrl: `https://mock-supabase.local/storage/v1/object/public/summit-photos/${path}`,
      },
    };
  }

  async remove(paths: string[]) {
    for (const p of paths) {
      this.files.delete(p);
    }
    return { data: paths, error: null };
  }
}

export class MockSupabaseClient {
  private store = new Map<string, MockRecord[]>();
  private storageBuckets = new Map<string, MockStorageBucket>();

  private currentUser: {
    id: string;
    email: string;
    user_metadata: any;
  } | null = {
    id: "mock-user-uuid-001",
    email: "test@example.com",
    user_metadata: { username: "tester" },
  };

  public setSessionUser(user: { id: string; email: string; user_metadata?: any } | null) {
    this.currentUser = user ? { ...user, user_metadata: user.user_metadata || {} } : null;
  }

  public auth = {
    getUser: async () => ({
      data: {
        user: this.currentUser as any,
      },
      error: null,
    }),
    getSession: async () => ({
      data: {
        session: (this.currentUser
          ? {
              access_token: "mock-token",
              user: this.currentUser,
            }
          : null) as any,
      },
      error: null,
    }),
    signOut: async () => {
      this.currentUser = null;
      return { error: null };
    },
    signInWithPassword: async ({ email }: { email?: string; password?: string } = {}) => {
      const id = `user-${Date.now()}`;
      const username = email ? email.split("@")[0] : "user";
      this.currentUser = {
        id,
        email: email || "user@example.com",
        user_metadata: { username },
      };
      return {
        data: { user: this.currentUser, session: { access_token: "mock-token", user: this.currentUser } },
        error: null,
      };
    },
    signUp: async ({ email, password: _password, options }: any = {}) => {
      const id = `user-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const metadata = options?.data || {};
      const username = metadata.username || (email ? email.split("@")[0] : "testuser");
      const isTest = Boolean(
        metadata.is_test ||
        (email && (email.includes("@test.") || email.includes("@e2e.") || email.includes("@example."))) ||
        username.startsWith("test_") ||
        username.startsWith("qa_")
      );

      this.currentUser = {
        id,
        email: email || "test@example.com",
        user_metadata: { ...metadata, username, is_test: isTest },
      };

      // Automatically seed profile in profiles table
      const profiles = this.store.get("profiles") || [];
      profiles.push({
        id,
        username,
        avatar_url: metadata.avatar_url || null,
        is_public: metadata.is_public !== false,
        is_test: isTest,
        created_at: new Date().toISOString(),
      });
      this.store.set("profiles", profiles);

      return {
        data: { user: this.currentUser, session: { access_token: "mock-token", user: this.currentUser } },
        error: null,
      };
    },
    updateUser: async ({ data }: { data: any }) => {
      if (this.currentUser) {
        this.currentUser.user_metadata = { ...this.currentUser.user_metadata, ...data };
      }
      return { data: { user: this.currentUser }, error: null };
    },
    onAuthStateChange: () => ({
      data: { subscription: { unsubscribe: () => {} } },
    }),
  };

  public storage = {
    from: (bucketId: string) => {
      if (!this.storageBuckets.has(bucketId)) {
        this.storageBuckets.set(bucketId, new MockStorageBucket());
      }
      return this.storageBuckets.get(bucketId)!;
    },
  };

  public async rpc(functionName: string, args: any = {}) {
    if (functionName === "get_user_ranking") {
      const profiles = (this.store.get("profiles") || []).filter((p) => p.is_test !== true);
      const ascents = (this.store.get("ascents") || []).filter((a) => a.is_wishlist !== true);
      const mode = args?.p_mode || "countries";

      const ranking = profiles
        .map((p) => {
          const userAscents = ascents.filter((a) => {
            if (a.user_id !== p.id) return false;
            if (mode === "countries") return String(a.summit_id).startsWith("country-");
            if (mode === "peaks") return !String(a.summit_id).startsWith("country-") && !String(a.summit_id).startsWith("region-");
            return true;
          });
          const uniqueSummits = new Set(userAscents.map((a) => a.summit_id));
          return {
            user_id: p.id,
            username: p.username,
            avatar_url: p.avatar_url || null,
            ascents_count: uniqueSummits.size,
          };
        })
        .filter((entry) => entry.ascents_count > 0)
        .sort((a, b) => b.ascents_count - a.ascents_count);

      return { data: ranking, error: null };
    }

    if (functionName === "get_recommended_profiles") {
      const profiles = (this.store.get("profiles") || []).filter(
        (p) => p.is_test !== true && p.is_public === true && p.id !== this.currentUser?.id
      );
      return { data: profiles, error: null };
    }

    if (functionName === "get_collective_visited_countries") {
      const profiles = (this.store.get("profiles") || []).filter((p) => p.is_test !== true && p.is_public === true);
      const publicUserIds = new Set(profiles.map((p) => p.id));
      const ascents = (this.store.get("ascents") || []).filter(
        (a) => publicUserIds.has(a.user_id) && String(a.summit_id).startsWith("country-") && a.is_wishlist !== true
      );

      const map = new Map<string, Set<string>>();
      for (const a of ascents) {
        if (!map.has(a.summit_id)) map.set(a.summit_id, new Set());
        map.get(a.summit_id)!.add(a.user_id);
      }

      const results = Array.from(map.entries()).map(([country_id, users]) => ({
        country_id,
        visitor_count: users.size,
      }));
      return { data: results, error: null };
    }

    if (functionName === "get_collective_summits") {
      const mode = args?.p_mode || "countries";
      const followingOnly = args?.p_following_only || false;
      const profiles = this.store.get("profiles") || [];
      const connections = this.store.get("connections") || [];
      const currentUserId = this.currentUser?.id;

      let allowedUserIds = new Set<string>();
      if (followingOnly) {
        const followingIds = new Set(
          connections
            .filter((c) => c.follower_id === currentUserId && c.status === "accepted")
            .map((c) => c.following_id)
        );
        allowedUserIds = followingIds;
      } else {
        allowedUserIds = new Set(
          profiles
            .filter((p) => p.is_public === true || p.id === currentUserId)
            .map((p) => p.id)
        );
      }

      const ascents = (this.store.get("ascents") || []).filter(
        (a) =>
          allowedUserIds.has(a.user_id) &&
          a.is_wishlist !== true &&
          (mode === "countries" ? String(a.summit_id).startsWith("country-") : !String(a.summit_id).startsWith("country-"))
      );

      const profileMap = new Map(profiles.map((p) => [p.id, p]));
      const grouped = new Map<string, { visitor_ids: string[]; visitor_usernames: string[]; visitor_avatars: string[] }>();

      for (const a of ascents) {
        const p = profileMap.get(a.user_id);
        if (!p) continue;
        if (!grouped.has(a.summit_id)) {
          grouped.set(a.summit_id, { visitor_ids: [], visitor_usernames: [], visitor_avatars: [] });
        }
        const g = grouped.get(a.summit_id)!;
        if (!g.visitor_ids.includes(p.id)) {
          g.visitor_ids.push(p.id);
          g.visitor_usernames.push(p.username);
          g.visitor_avatars.push(p.avatar_url || "");
        }
      }

      const results = Array.from(grouped.entries()).map(([summit_id, data]) => ({
        summit_id,
        ...data,
      }));
      return { data: results, error: null };
    }

    if (functionName === "get_user_completed_summits") {
      const targetUserId = args?.p_user_id;
      const ascents = (this.store.get("ascents") || []).filter(
        (a) => a.user_id === targetUserId && a.is_wishlist !== true
      );
      const uniqueSummits = Array.from(new Set(ascents.map((a) => a.summit_id))).map((summit_id) => ({
        summit_id,
      }));
      return { data: uniqueSummits, error: null };
    }

    if (functionName === "get_feed_photos") {
      const pairs = (args?.pairs || []) as Array<{ user_id: string; summit_id: string }>;
      const summitPhotos = this.store.get("summit_photos") || [];
      const pairSet = new Set(pairs.map((p) => `${p.user_id}|${p.summit_id}`));

      const matchingPhotos = summitPhotos
        .filter((photo) => pairSet.has(`${photo.user_id}|${photo.summit_id}`))
        .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());

      return { data: matchingPhotos, error: null };
    }

    return { data: [], error: null };
  }

  from(tableName: string): MockQueryBuilder {
    return new MockQueryBuilder(tableName, this.store);
  }

  // Helper for test fixtures
  seedTable(tableName: string, data: MockRecord[]): void {
    this.store.set(tableName, [...data]);
  }

  getTableData(tableName: string): MockRecord[] {
    return this.store.get(tableName) || [];
  }

  clear(): void {
    this.store.clear();
    this.storageBuckets.clear();
  }
}

export function createMockSupabaseClient(): MockSupabaseClient {
  return new MockSupabaseClient();
}
