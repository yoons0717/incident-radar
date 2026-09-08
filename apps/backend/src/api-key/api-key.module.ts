import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { ApiKey } from "../db/entities/api-key.entity";
import { ApiKeyController } from "./api-key.controller";
import { ApiKeyGuard } from "./api-key.guard";
import { ApiKeyService } from "./api-key.service";

@Module({
  imports: [TypeOrmModule.forFeature([ApiKey]), AuthModule],
  controllers: [ApiKeyController],
  providers: [ApiKeyService, ApiKeyGuard],
  exports: [ApiKeyService, ApiKeyGuard],
})
export class ApiKeyModule {}
