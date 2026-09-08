import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ApiKey } from "../db/entities/api-key.entity";
import { ApiKeyGuard } from "./api-key.guard";
import { ApiKeyService } from "./api-key.service";

@Module({
  imports: [TypeOrmModule.forFeature([ApiKey])],
  providers: [ApiKeyService, ApiKeyGuard],
  exports: [ApiKeyService, ApiKeyGuard],
})
export class ApiKeyModule {}
