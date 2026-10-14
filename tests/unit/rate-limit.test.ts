import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  RateLimiter,
  getClientIp,
  authRateLimiter,
  geocodingClientRateLimiter,
  throttleNominatim,
  resetNominatimThrottle,
} from "@/lib/rate-limit";

describe("Rate Limiting Utilities", () => {
  describe("getClientIp", () => {
    it("should extract the first client IP from comma-separated x-forwarded-for header", () => {
      const req = new Request("https://example.com/api/test", {
        headers: { "x-forwarded-for": "203.0.113.195, 70.41.3.18, 150.172.238.178" },
      });
      expect(getClientIp(req)).toBe("203.0.113.195");
    });

    it("should extract client IP from x-real-ip if x-forwarded-for is missing", () => {
      const req = new Request("https://example.com/api/test", {
        headers: { "x-real-ip": "198.51.100.4" },
      });
      expect(getClientIp(req)).toBe("198.51.100.4");
    });

    it("should extract client IP from cf-connecting-ip if other headers are missing", () => {
      const req = new Request("https://example.com/api/test", {
        headers: { "cf-connecting-ip": "192.0.2.1" },
      });
      expect(getClientIp(req)).toBe("192.0.2.1");
    });

    it("should fallback to 127.0.0.1 if no IP headers are present", () => {
      const req = new Request("https://example.com/api/test");
      expect(getClientIp(req)).toBe("127.0.0.1");
    });
  });

  describe("RateLimiter Class", () => {
    it("should allow requests up to the max threshold and block exceeding requests", () => {
      const limiter = new RateLimiter({ windowMs: 1000, max: 3 });
      const testIp = "192.168.1.100";

      // 1st request
      const r1 = limiter.check(testIp);
      expect(r1.success).toBe(true);
      expect(r1.remaining).toBe(2);

      // 2nd request
      const r2 = limiter.check(testIp);
      expect(r2.success).toBe(true);
      expect(r2.remaining).toBe(1);

      // 3rd request
      const r3 = limiter.check(testIp);
      expect(r3.success).toBe(true);
      expect(r3.remaining).toBe(0);

      // 4th request (should be blocked)
      const r4 = limiter.check(testIp);
      expect(r4.success).toBe(false);
      expect(r4.remaining).toBe(0);
      expect(r4.resetMs).toBeGreaterThan(0);
    });

    it("should partition rate limits independently per IP key", () => {
      const limiter = new RateLimiter({ windowMs: 1000, max: 2 });
      const ipA = "10.0.0.1";
      const ipB = "10.0.0.2";

      limiter.check(ipA);
      limiter.check(ipA);
      expect(limiter.check(ipA).success).toBe(false);

      // ipB should still be allowed
      expect(limiter.check(ipB).success).toBe(true);
      expect(limiter.check(ipB).success).toBe(true);
      expect(limiter.check(ipB).success).toBe(false);
    });

    it("should reset rate limit when window expires", () => {
      vi.useFakeTimers();
      const limiter = new RateLimiter({ windowMs: 5000, max: 2 });
      const ip = "10.0.0.5";

      expect(limiter.check(ip).success).toBe(true);
      expect(limiter.check(ip).success).toBe(true);
      expect(limiter.check(ip).success).toBe(false);

      // Advance time beyond window
      vi.advanceTimersByTime(5001);

      expect(limiter.check(ip).success).toBe(true);
      vi.useRealTimers();
    });
  });

  describe("API Endpoint Specific Rate Limiters", () => {
    beforeEach(() => {
      authRateLimiter.reset();
      geocodingClientRateLimiter.reset();
      resetNominatimThrottle();
    });

    it("authRateLimiter should allow 10 login attempts per minute", () => {
      const ip = "auth-test-ip";
      for (let i = 0; i < 10; i++) {
        const res = authRateLimiter.check(ip);
        expect(res.success).toBe(true);
      }
      const blocked = authRateLimiter.check(ip);
      expect(blocked.success).toBe(false);
      expect(blocked.remaining).toBe(0);
    });

    it("geocodingClientRateLimiter should enforce 1 request per second per client IP", () => {
      const ip = "geocoding-test-ip";
      const first = geocodingClientRateLimiter.check(ip);
      expect(first.success).toBe(true);

      const immediateSecond = geocodingClientRateLimiter.check(ip);
      expect(immediateSecond.success).toBe(false);
    });

    it("throttleNominatim should serialize consecutive calls with at least minInterval spacing", async () => {
      const start = Date.now();
      const p1 = throttleNominatim(50);
      const p2 = throttleNominatim(50);
      await Promise.all([p1, p2]);
      const duration = Date.now() - start;
      expect(duration).toBeGreaterThanOrEqual(45);
    });
  });
});
