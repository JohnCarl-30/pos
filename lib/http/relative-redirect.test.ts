import { describe, expect, it } from "vitest";
import { relativeRedirect } from "./relative-redirect";

describe("relativeRedirect", () => {
  it("sets a relative Location with 303 by default", () => {
    const response = relativeRedirect("/login?error=no-access");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/login?error=no-access");
  });

  it("accepts a custom status", () => {
    expect(relativeRedirect("/register", 307).status).toBe(307);
  });

  it("rejects absolute and protocol-relative locations", () => {
    expect(() => relativeRedirect("https://evil.test/")).toThrow();
    expect(() => relativeRedirect("//evil.test/")).toThrow();
    expect(() => relativeRedirect("login")).toThrow();
  });
});
