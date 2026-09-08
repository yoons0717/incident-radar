import { buildOpenApiDocument } from "./openapi.document";

/**
 * 이 문서는 부트스트랩 때 무조건 호출된다 — 여기서 던지면 앱 전체가 안 뜬다.
 * 스키마 등록 실수(오타·중복 refId 등)를 여기서 잡는다.
 */
describe("buildOpenApiDocument", () => {
  it("에러 없이 문서를 만들고, 엔드포인트·스키마가 다 등록돼 있다", () => {
    const doc = buildOpenApiDocument();

    expect(Object.keys(doc.paths ?? {}).sort()).toEqual([
      "/alerts",
      "/errors",
      "/health",
      "/stats",
      "/status",
    ]);
    expect(doc.paths?.["/errors"]).toHaveProperty("post");
    expect(doc.paths?.["/errors"]).toHaveProperty("get");

    // POST /errors 는 API 키(Bearer) 인증이 필요하다 — 문서에도 반영돼야 한다.
    expect(doc.components?.securitySchemes).toHaveProperty("bearerAuth");
    const postErrors = (doc.paths?.["/errors"] as { post: { security?: unknown } }).post;
    expect(postErrors.security).toEqual([{ bearerAuth: [] }]);

    expect(Object.keys(doc.components?.schemas ?? {}).sort()).toEqual([
      "Alert",
      "ErrorLog",
      "ErrorLogInput",
      "HealthResult",
      "ServiceStatus",
      "StatsResponse",
    ]);
  });
});
