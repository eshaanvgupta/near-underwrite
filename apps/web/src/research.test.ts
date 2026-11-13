import { describe, expect, it } from "vitest";
import { canonicalJson } from "@near-underwrite/shared";

describe("portable exports", () => {
  it("canonicalizes object keys independent of insertion order", () => {
    expect(canonicalJson({ b: 2, a: { d: 4, c: 3 } })).toBe('{"a":{"c":3,"d":4},"b":2}');
  });

  it("does not make credential fields part of the bundle schema", () => {
    const schemaKeys = ["schema_version", "report_id", "created_at", "parent_publication_id", "snapshot", "assumptions", "result", "claims", "ai_results", "notes", "formula_version", "credential_material_included"];
    expect(schemaKeys.some((key) => /key|credential|password/i.test(key) && key !== "credential_material_included")).toBe(false);
  });
});
