import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { loginAgent, TEST_ADMIN } from "./auth";

describe("auth session (e2e)", () => {
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

  it("잘못된 비밀번호면 401", async () => {
    await http()
      .post("/auth/login")
      .send({ email: TEST_ADMIN.email, password: "wrong" })
      .expect(401);
  });

  it("로그인 성공 시 200 + Set-Cookie", async () => {
    const res = await http()
      .post("/auth/login")
      .send({ email: TEST_ADMIN.email, password: TEST_ADMIN.password })
      .expect(200);
    expect(res.headers["set-cookie"]).toBeDefined();
    expect(res.body).toEqual({ email: TEST_ADMIN.email, role: "admin" });
  });

  it("세션 없이 GET /auth/me 는 401", async () => {
    await http().get("/auth/me").expect(401);
  });

  it("재로그인하면 세션 쿠키(SID)가 새로 발급된다 (fixation 방지)", async () => {
    const agent = request.agent(app.getHttpServer());
    const login = () =>
      agent
        .post("/auth/login")
        .send({ email: TEST_ADMIN.email, password: TEST_ADMIN.password })
        .expect(200);
    const sid = (res: request.Response) =>
      String((res.headers["set-cookie"] as unknown as string[])?.[0] ?? "").split(";")[0];

    const first = sid(await login());
    const second = sid(await login());
    expect(first).not.toBe("");
    expect(second).not.toBe(first);
  });

  it("로그인한 agent 는 /auth/me 로 자기 정보를 받고, logout 후엔 401", async () => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post("/auth/login")
      .send({ email: TEST_ADMIN.email, password: TEST_ADMIN.password })
      .expect(200);

    const me = await agent.get("/auth/me").expect(200);
    expect(me.body).toEqual({ email: TEST_ADMIN.email, role: "admin" });

    await agent.post("/auth/logout").expect(204);
    await agent.get("/auth/me").expect(401);
  });

  describe("조회 라우트 보호", () => {
    it.each(["/stats?service=x&bucket=60", "/status", "/alerts", "/errors?service=x"])(
      "세션 없이 GET %s 는 401",
      async (path) => {
        await http().get(path).expect(401);
      },
    );

    it("로그인하면 조회 라우트가 200", async () => {
      const agent = await loginAgent(app);
      await agent.get("/status").expect(200);
      await agent.get("/alerts").expect(200);
      await agent.get("/errors?service=checkout").expect(200);
    });
  });
});
