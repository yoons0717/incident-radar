import { Controller, Get } from "@nestjs/common";
import { HealthService, type HealthResult } from "./health.service";

@Controller("health")
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  check(): Promise<HealthResult> {
    return this.health.check();
  }
}
