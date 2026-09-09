import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "../db/entities/user.entity";
import { AuthController } from "./auth.controller";
import { RolesGuard } from "./roles.guard";
import { SessionGuard } from "./session.guard";
import { UserService } from "./user.service";

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [AuthController],
  providers: [UserService, SessionGuard, RolesGuard],
  exports: [UserService, SessionGuard, RolesGuard],
})
export class AuthModule {}
