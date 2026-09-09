import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { SessionGuard } from "../auth/session.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AlertsQuery, StatsQuery } from "./dashboard.schema";
import { DashboardService } from "./dashboard.service";

/** 대시보드 3패널용 읽기 엔드포인트. 루트 경로에 /stats·/status·/alerts. 로그인 필수. */
@Controller()
@UseGuards(SessionGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get("stats")
  stats(@Query(new ZodValidationPipe(StatsQuery)) q: StatsQuery) {
    return this.dashboard.stats(q);
  }

  @Get("status")
  status() {
    return this.dashboard.status();
  }

  @Get("alerts")
  alerts(@Query(new ZodValidationPipe(AlertsQuery)) q: AlertsQuery) {
    return this.dashboard.recentAlerts(q);
  }
}
