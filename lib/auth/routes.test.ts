import { describe, expect, it } from "vitest";
import { decideRoute, safeNext } from "./routes";

const ready = { search: "", signedIn: true, setupComplete: true };

describe("decideRoute", () => {
  it("sends everything to /setup until setup is complete", () => {
    expect(decideRoute({ ...ready, pathname: "/orders", setupComplete: false })).toEqual({ type: "redirect", to: "/setup" });
    expect(decideRoute({ ...ready, pathname: "/setup", setupComplete: false, signedIn: false })).toEqual({ type: "next" });
  });

  it("lets /setup through after setup so the page can 404", () => {
    expect(decideRoute({ ...ready, pathname: "/setup" })).toEqual({ type: "next" });
  });

  it("sends signed-out visitors to login with a return path", () => {
    expect(decideRoute({ ...ready, signedIn: false, pathname: "/orders", search: "?page=2" })).toEqual({
      type: "redirect",
      to: "/login?next=%2Forders%3Fpage%3D2",
    });
    expect(decideRoute({ ...ready, signedIn: false, pathname: "/" })).toEqual({ type: "redirect", to: "/login" });
  });

  it("lets signed-out visitors reach public pages", () => {
    for (const pathname of ["/login", "/forgot-password", "/reset-password", "/auth/confirm", "/auth/signout"]) {
      expect(decideRoute({ ...ready, signedIn: false, pathname })).toEqual({ type: "next" });
    }
  });

  it("sends signed-in staff away from the login page", () => {
    expect(decideRoute({ ...ready, pathname: "/login" })).toEqual({ type: "redirect", to: "/register" });
  });

  it("does not treat lookalike paths as public", () => {
    expect(decideRoute({ ...ready, signedIn: false, pathname: "/login-help" })).toEqual({
      type: "redirect",
      to: "/login?next=%2Flogin-help",
    });
  });
});

describe("safeNext", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/orders?page=2")).toBe("/orders?page=2");
  });
  it("rejects anything that could leave the site", () => {
    expect(safeNext("//evil.test")).toBe("/register");
    expect(safeNext("/\\evil.test")).toBe("/register");
    expect(safeNext("https://evil.test")).toBe("/register");
    expect(safeNext("orders")).toBe("/register");
    expect(safeNext(null)).toBe("/register");
    expect(safeNext(undefined)).toBe("/register");
  });
});
