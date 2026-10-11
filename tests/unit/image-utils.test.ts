import { describe, it, expect } from "vitest";
import {
  compressImage,
  sortPhotosByTime,
  getPhotoTimeSortKey,
  sortFilesByCaptureTime,
} from "@/lib/image-utils";

describe("Image Compression Utilities", () => {
  it("should gracefully fallback to original Blob when canvas/createImageBitmap are not available in node env", async () => {
    const mockBlob = new Blob(["fake image data"], { type: "image/jpeg" });
    const result = await compressImage(mockBlob);

    expect(result).toBeDefined();
    expect(result.size).toBe(mockBlob.size);
    expect(result.type).toBe(mockBlob.type);
  });

  it("should respect maxWidthPx and quality arguments without crashing", async () => {
    const mockBlob = new Blob(["test-pixels"], { type: "image/png" });
    const result = await compressImage(mockBlob, 800, 0.6);

    expect(result).toBeDefined();
    expect(result).toBe(mockBlob);
  });
});

describe("Photo Chronological Ordering in Grids", () => {
  it("should order 4 photos chronologically: index 0 (top-left), index 1 (top-right), index 2 (bottom-left), index 3 (bottom-right)", () => {
    const photoDawn = {
      id: "photo-dawn",
      summit_id: "toledo",
      public_url: "https://example.com/p1.jpg",
      taken_on: "2026-10-10",
      caption: "Amanecer",
      created_at: "2026-10-10T21:35:33Z",
      storage_path: "user/toledo/p1.jpg",
      shot_at: "2026-10-10T08:30:00Z",
    };
    const photoMidday = {
      id: "photo-midday",
      summit_id: "toledo",
      public_url: "https://example.com/p2.jpg",
      taken_on: "2026-10-10",
      caption: "Mediodía",
      created_at: "2026-10-10T21:35:34Z",
      storage_path: "user/toledo/p2.jpg",
      shot_at: "2026-10-10T11:15:00Z",
    };
    const photoSummit = {
      id: "photo-summit",
      summit_id: "toledo",
      public_url: "https://example.com/p3.jpg",
      taken_on: "2026-10-10",
      caption: "Cumbre",
      created_at: "2026-10-10T21:35:36Z",
      storage_path: "user/toledo/p3.jpg",
      shot_at: "2026-10-10T13:45:00Z",
    };
    const photoDescent = {
      id: "photo-descent",
      summit_id: "toledo",
      public_url: "https://example.com/p4.jpg",
      taken_on: "2026-10-10",
      caption: "Bajada",
      created_at: "2026-10-10T21:35:38Z",
      storage_path: "user/toledo/p4.jpg",
      shot_at: "2026-10-10T16:20:00Z",
    };

    // Shuffled input
    const shuffled = [photoDescent, photoDawn, photoSummit, photoMidday];
    const sorted = sortPhotosByTime(shuffled);

    // Order must strictly be:
    // [0] Arriba izquierda (la más temprana: 08:30)
    // [1] Arriba derecha (la segunda: 11:15)
    // [2] Abajo izquierda (la tercera: 13:45)
    // [3] Abajo derecha (la cuarta: 16:20)
    expect(sorted[0].id).toBe("photo-dawn");
    expect(sorted[1].id).toBe("photo-midday");
    expect(sorted[2].id).toBe("photo-summit");
    expect(sorted[3].id).toBe("photo-descent");
  });

  it("should extract timestamp from filename when shot_at is missing", () => {
    const p1 = {
      id: "p1",
      storage_path: "user/lugo/uuid-IMG_20210812_093112.jpg",
      taken_on: "2021-08-12",
    };
    const p2 = {
      id: "p2",
      storage_path: "user/lugo/uuid-IMG_20210812_114500.jpg",
      taken_on: "2021-08-12",
    };
    const p3 = {
      id: "p3",
      storage_path: "user/lugo/uuid-IMG_20210812_141022.jpg",
      taken_on: "2021-08-12",
    };
    const p4 = {
      id: "p4",
      storage_path: "user/lugo/uuid-IMG_20210812_173045.jpg",
      taken_on: "2021-08-12",
    };

    const sorted = sortPhotosByTime([p4, p2, p1, p3]);

    expect(sorted[0].id).toBe("p1");
    expect(sorted[1].id).toBe("p2");
    expect(sorted[2].id).toBe("p3");
    expect(sorted[3].id).toBe("p4");
  });

  it("should sort Android camera sequence numbers chronologically", () => {
    const toledoPhotos = [
      {
        id: "p4",
        storage_path: "user/toledo/uuid-1000050885.jpg",
        created_at: "2026-10-10 21:35:38+00",
      },
      {
        id: "p1",
        storage_path: "user/toledo/uuid-1000050860.jpg",
        created_at: "2026-10-10 21:35:33+00",
      },
      {
        id: "p3",
        storage_path: "user/toledo/uuid-1000050874.jpg",
        created_at: "2026-10-10 21:35:36+00",
      },
      {
        id: "p2",
        storage_path: "user/toledo/uuid-1000050869.jpg",
        created_at: "2026-10-10 21:35:34+00",
      },
    ];

    const sorted = sortPhotosByTime(toledoPhotos);

    expect(sorted.map((p) => p.id)).toEqual(["p1", "p2", "p3", "p4"]);
  });

  it("should sort files before upload using sortFilesByCaptureTime", async () => {
    const fileEarly = new File(["dummy1"], "IMG_20261010_083000.jpg", {
      type: "image/jpeg",
      lastModified: 1728541800000,
    });
    const fileLate = new File(["dummy2"], "IMG_20261010_164500.jpg", {
      type: "image/jpeg",
      lastModified: 1728571500000,
    });

    const sorted = await sortFilesByCaptureTime([fileLate, fileEarly], "2026-10-10");

    expect(sorted[0].file.name).toBe("IMG_20261010_083000.jpg");
    expect(sorted[1].file.name).toBe("IMG_20261010_164500.jpg");
  });
});
