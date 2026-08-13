import assert from "node:assert/strict";
import test from "node:test";

test("preserves the complete Python scan response for display", async () => {
  const service = await import("../src/services/api.service.ts");
  const formatter = Reflect.get(service, "toScanDisplayResult");

  assert.equal(typeof formatter, "function", "scan result formatter is not implemented");

  const response = {
    success: true,
    count: 2,
    barcodes: ["H-1001", "H-1002"]
  };
  const result = formatter(response);

  assert.deepEqual(result.codes, response.barcodes);
  assert.equal(result.count, 2);
  assert.equal(result.success, true);
  assert.equal(result.rawJson, JSON.stringify(response, null, 2));
});
