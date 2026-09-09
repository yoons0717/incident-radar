import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import * as bcrypt from "bcrypt";
import { Repository } from "typeorm";
import { User } from "../db/entities/user.entity";

const BCRYPT_ROUNDS = 12;
// 이메일이 없을 때도 bcrypt 를 한 번 태워 응답 시간을 평준화한다 (유저 열거 방지).
// 랜덤 문자열의 실제 bcrypt 해시 — 어떤 비밀번호와도 매칭되지 않는다.
const DUMMY_HASH = "$2b$12$bOFqOf1Ix60SEyjDDVSRxesDaiHIvKpZF3Z3beCoCEKLz3A/ZLqzm";

export interface CreateUserInput {
  email: string;
  password: string;
  role: string;
}

@Injectable()
export class UserService {
  constructor(@InjectRepository(User) private readonly repo: Repository<User>) {}

  /** 유저를 만들거나(이메일 기준) 이미 있으면 비밀번호·역할을 갱신한다 — seed 재실행 대비. */
  async create({ email, password, role }: CreateUserInput): Promise<User> {
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const existing = await this.repo.findOneBy({ email });
    if (existing) {
      await this.repo.update(existing.id, { passwordHash, role });
      return this.repo.findOneByOrFail({ id: existing.id });
    }
    return this.repo.save(this.repo.create({ email, passwordHash, role }));
  }

  findByEmail(email: string): Promise<User | null> {
    return this.repo.findOneBy({ email });
  }

  /** 이메일+비밀번호 검증. 맞으면 유저, 아니면 null. */
  async verifyLogin(email: string, password: string): Promise<User | null> {
    const user = await this.repo.findOneBy({ email });
    const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    return ok && user ? user : null;
  }
}
