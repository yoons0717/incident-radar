import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { ErrorLogInput } from "@incident-radar/shared";
import { Repository } from "typeorm";
import { ErrorLog } from "../db/entities/error-log.entity";
import type { ErrorsQuery } from "./errors.schema";

@Injectable()
export class ErrorsService {
  constructor(
    @InjectRepository(ErrorLog)
    private readonly repo: Repository<ErrorLog>,
  ) {}

  create(input: ErrorLogInput): Promise<ErrorLog> {
    return this.repo.save(this.repo.create(input));
  }

  find(q: ErrorsQuery): Promise<ErrorLog[]> {
    const qb = this.repo
      .createQueryBuilder("e")
      .where("e.service = :service", { service: q.service });

    // QueryBuilder 에는 엔티티 프로퍼티명(createdAt)을 쓴다 — TypeORM 이 컬럼으로 매핑.
    if (q.from) qb.andWhere("e.createdAt >= :from", { from: q.from });
    if (q.to) qb.andWhere("e.createdAt <= :to", { to: q.to });

    return qb.orderBy("e.createdAt", "DESC").limit(q.limit).getMany();
  }
}
