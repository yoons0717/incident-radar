import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { CooldownModule } from "../cooldown/cooldown.module";
import { AlertFailure } from "../db/entities/alert-failure.entity";
import { Alert } from "../db/entities/alert.entity";
import { ErrorLog } from "../db/entities/error-log.entity";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";

@Module({
  imports: [TypeOrmModule.forFeature([ErrorLog, Alert, AlertFailure]), CooldownModule, AuthModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
