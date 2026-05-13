import { describe, expect, it } from "vitest";
import { __test__ } from "./product-image-service";

describe("product-image-service paths", () => {
  it("genera path canónico con businessId/productId", () => {
    const p = __test__.pathForProduct("biz_dermaland", "prod_001");
    expect(p).toBe("businesses/biz_dermaland/products/prod_001/image.webp");
  });

  it("usa bucket product-images", () => {
    expect(__test__.BUCKET).toBe("product-images");
  });
});
