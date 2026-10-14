import { describe, expect, it } from "vitest";
import { pickRegister } from "./pick-register";

const a = { id: "a", name: "Counter 1" };
const b = { id: "b", name: "Counter 2" };

describe("pickRegister", () => {
  it("uses the remembered register when it belongs to this store", () => {
    expect(pickRegister([a, b], "b")).toBe(b);
  });
  it("asks again when the remembered register is from another store", () => {
    expect(pickRegister([a, b], "zzz")).toBeNull();
  });
  it("picks the only register automatically", () => {
    expect(pickRegister([a], undefined)).toBe(a);
  });
  it("asks when there are several and none is remembered", () => {
    expect(pickRegister([a, b], undefined)).toBeNull();
  });
});
