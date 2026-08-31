import { Injectable } from "@nestjs/common";

/**
 * 현재 시각(ms)을 주입 가능한 형태로 감싼다.
 * 테스트에서 이 프로바이더를 가짜로 갈아끼워 시간을 고정 → sleep 없이 결정론적으로 검증.
 */
@Injectable()
export class Clock {
  now(): number {
    return Date.now();
  }
}
