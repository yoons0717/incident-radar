import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ErrorLog } from "@incident-radar/shared";
import request from "supertest";
import { AppModule } from "../src/app.module";

describe("errors API (e2e)", () => {
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

  it("POST 로 저장하고 GET 으로 되돌려 받는다 (응답이 ErrorLog 스키마와 일치)", async () => {
    const created = await http()
      .post("/errors")
      .send({ service: "checkout", message: "payment timeout" })
      .expect(201);

    // 응답이 공유 스키마를 통과해야 한다 (Date → ISO 문자열 직렬화 포함)
    const parsed = ErrorLog.parse(created.body);
    expect(parsed.service).toBe("checkout");

    const list = await http().get("/errors").query({ service: "checkout" }).expect(200);
    const rows = list.body.map((r: unknown) => ErrorLog.parse(r));
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(parsed.id);
  });

  it("service 가 없으면 400 + issues", async () => {
    const res = await http().post("/errors").send({ message: "no service" }).expect(400);
    expect(res.body.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "service" })]),
    );
  });

  it("message 가 8192 를 넘으면 400", async () => {
    await http()
      .post("/errors")
      .send({ service: "checkout", message: "a".repeat(8193) })
      .expect(400);
  });

  it("GET 에 service 가 없으면 400", async () => {
    await http().get("/errors").expect(400);
  });

  it("limit 이 1000 을 넘어도 에러 없이 클램프된다", async () => {
    await http().post("/errors").send({ service: "auth", message: "x" }).expect(201);
    const res = await http().get("/errors").query({ service: "auth", limit: 5000 }).expect(200);
    expect(res.body).toHaveLength(1);
  });

  it("from/to 로 시간 범위를 거른다", async () => {
    await http().post("/errors").send({ service: "search", message: "old-ish" }).expect(201);

    const future = new Date(Date.now() + 60_000).toISOString();
    const empty = await http()
      .get("/errors")
      .query({ service: "search", from: future })
      .expect(200);
    expect(empty.body).toHaveLength(0);

    const past = new Date(Date.now() - 60_000).toISOString();
    const found = await http().get("/errors").query({ service: "search", from: past }).expect(200);
    expect(found.body).toHaveLength(1);
  });
});
