import { ErrorLog } from "./error-log.entity";

/**
 * 엔티티 단일 목록. data-source.ts(마이그레이션 CLI)와 app.module.ts(런타임)
 * 양쪽이 이걸 import 해서 목록이 갈라지지 않게 한다. 새 엔티티는 여기에만 추가.
 */
export const entities = [ErrorLog];

export { ErrorLog };
