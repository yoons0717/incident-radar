import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { loginAgent } from "./auth";

describe("API key 관리 (admin 전용, e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it("세션 없이 POST /api-keys 는 401", async () => {
    await http().post("/api-keys").send({ name: "x" }).expect(401);
  });

  it("viewer 세션은 403", async () => {
    const viewer = await loginAgent(app, "viewer");
    await viewer.post("/api-keys").send({ name: "x" }).expect(403);
    await viewer.get("/api-keys").expect(403);
  });

  it("admin 은 키를 발급하고, 그 키로 POST /errors 가 된다", async () => {
    const admin = await loginAgent(app, "admin");

    const res = await admin.post("/api-keys").send({ name: "ci-runner" }).expect(201);
    expect(res.body.token).toMatch(/^ir_/);
    expect(res.body.name).toBe("ci-runner");

    await http()
      .post("/errors")
      .set("authorization", `Bearer ${res.body.token}`)
      .send({ service: "checkout", message: "via new key" })
      .expect(201);
  });

  it("GET /api-keys 는 해시·평문을 노출하지 않는다", async () => {
    const admin = await loginAgent(app, "admin");
    await admin.post("/api-keys").send({ name: "listed" }).expect(201);

    const res = await admin.get("/api-keys").expect(200);
    const row = res.body.find((k: { name: string }) => k.name === "listed");
    expect(row).toBeDefined();
    expect(row).not.toHaveProperty("keyHash");
    expect(row).not.toHaveProperty("key_hash");
    expect(row).not.toHaveProperty("token");
    expect(row).toHaveProperty("prefix");
  });

  it("DELETE 로 폐기하면 그 키는 더 이상 POST /errors 에 못 쓴다", async () => {
    const admin = await loginAgent(app, "admin");
    const created = await admin.post("/api-keys").send({ name: "to-revoke" }).expect(201);

    await admin.delete(`/api-keys/${created.body.id}`).expect(204);

    await http()
      .post("/errors")
      .set("authorization", `Bearer ${created.body.token}`)
      .send({ service: "checkout", message: "revoked key" })
      .expect(401);
  });
});
