import { Module } from "@nestjs/common";
import { AlertsModule } from "../alerts/alerts.module";
import { CooldownModule } from "../cooldown/cooldown.module";
import { CounterModule } from "../counter/counter.module";
import { DetectorService } from "./detector.service";

@Module({
  imports: [CounterModule, CooldownModule, AlertsModule],
  providers: [DetectorService],
  exports: [DetectorService],
})
export class DetectorModule {}
