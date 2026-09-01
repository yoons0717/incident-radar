import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ErrorLog } from "../db/entities/error-log.entity";
import { DetectorModule } from "../detector/detector.module";
import { ErrorsController } from "./errors.controller";
import { ErrorsService } from "./errors.service";

@Module({
  imports: [TypeOrmModule.forFeature([ErrorLog]), DetectorModule],
  controllers: [ErrorsController],
  providers: [ErrorsService],
  exports: [ErrorsService],
})
export class ErrorsModule {}
