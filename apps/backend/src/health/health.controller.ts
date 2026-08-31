import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  /**
   * 지금은 스텁. Phase 5(T15)에서 DB·Redis 체크와
   * ok / degraded / 503 분기를 붙인다.
   */
  @Get()
  check() {
    return { status: "ok" };
  }
}
