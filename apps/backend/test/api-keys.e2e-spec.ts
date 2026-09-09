import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { TEST_BEARER } from "./auth";

describe("API key auth on POST /errors (e2e)", () => {
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
  const body = { service: "checkout", message: "payment timeout" };

  it("Authorization 헤더가 없으면 401", async () => {
    await http().post("/errors").send(body).expect(401);
  });

  it("잘못된 키면 401", async () => {
    await http()
      .post("/errors")
      .set("authorization", "Bearer ir_not_a_real_key")
      .send(body)
      .expect(401);
  });

  it("유효한 키면 201", async () => {
    await http().post("/errors").set("authorization", TEST_BEARER).send(body).expect(201);
  });

  it("인증은 통과하고 본문이 잘못되면 400 (guard 이후 검증 파이프 도달)", async () => {
    await http()
      .post("/errors")
      .set("authorization", TEST_BEARER)
      .send({ message: "no service" })
      .expect(400);
  });
});
