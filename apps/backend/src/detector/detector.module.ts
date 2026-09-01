import { Module } from "@nestjs/common";
import { CounterModule } from "../counter/counter.module";
import { DetectorService } from "./detector.service";

@Module({
  imports: [CounterModule],
  providers: [DetectorService],
  exports: [DetectorService],
})
export class DetectorModule {}
