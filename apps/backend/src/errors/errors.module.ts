import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ApiKeyModule } from "../api-key/api-key.module";
import { AuthModule } from "../auth/auth.module";
import { ErrorLog } from "../db/entities/error-log.entity";
import { DetectorModule } from "../detector/detector.module";
import { ErrorsController } from "./errors.controller";
import { ErrorsService } from "./errors.service";

@Module({
  imports: [TypeOrmModule.forFeature([ErrorLog]), DetectorModule, ApiKeyModule, AuthModule],
  controllers: [ErrorsController],
  providers: [ErrorsService],
  exports: [ErrorsService],
})
export class ErrorsModule {}
