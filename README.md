# 도서관나우 (Library Now) — kr-library-now

**지금 자리 있는 공공도서관을 지도에서.** 공공도서관 열람실의 실시간 잔여좌석 + 운영시간·휴관 여부를 내 주변부터 보여 주는 한국어 지도 앱.

데이터: **행정안전부 한국지역정보개발원 — (전국 통합데이터) 공공도서관 열람실 실시간 정보** (공공데이터포털 `15142580`).

## 이 앱이 정직하게 다루는 것

- **커버리지가 얇고 수도권에 몰려 있다.** 실시간 좌석을 실제로 주는 곳은 전국 **약 120곳(경기 83·서울 17 등 수도권 약 85%)**. 이 사실을 첫 화면·목록 상단·지도에 **명시**한다. 조용히 빈 지도를 보여 주지 않는다.
- **잔여 `0`(만석)과 `실시간 미제공`은 절대 같지 않다.** 만석은 빨강, 미제공은 회색, 여유는 초록 — 색과 문구가 다르다(`lib/seat-status.ts`, 타입으로 강제).
- **실시간이 이름뿐이 아니다.** 좌석은 60초마다 다시 받고(실측: 3분새 다수 열람실의 잔여좌석이 실제로 변함), 마지막 갱신 시각을 표시한다. 연계가 끊긴(오늘 갱신 안 된) 도서관은 "갱신 안 됨"으로 경고한다.
- **"오늘 여는가"는 추정이다.** 휴관정보가 자연어(`둘째 주 화+넷째 주 화+공휴일`)라 완벽히 파싱할 수 없어, 휴리스틱 판정에 "(추정)" 라벨을 단다.

## 구조

```
lib/
  library-api.ts     info_v2(도서관·정적) + rlt_rdrm_info_v2(좌석·실시간) 클라이언트. 키 verbatim.
  library-cache.ts   ★ TTL 분리: 디렉터리=KST 자정 / 좌석=60초. 모듈 캐시 + inflight.
  libraries.ts       정규화·조인·응답파서·'지금 여는가'. 전부 순수 함수(테스트 대상).
  seat-status.ts     좌석 여유 상태(만석/미제공/여유) 판정. 순수.
  lib-filters.ts     도서관 필터(지금 자리·실시간·지금 열림·시도). 순수.
  geo.ts / kst.ts / cache-control.ts   거리·KST·CDN 캐시. 순수.
app/api/
  libraries/         정적 디렉터리(168곳). CDN SWR, KST 자정까지.
  seats/             실시간 좌석 스냅샷. 짧은 s-maxage(60s).
  warm/              크론 예열(양쪽 데운다). CRON_SECRET 필수(fail closed).
components/          libraries-browser(오케스트레이터) · libraries-map(v5) · card · detail · command-palette
```

**도서관을 1급 엔티티**로 두고 좌석을 그 속성으로 붙였다. 정보나루(`data4library.kr`)가 활성화되면 "이 책 있는 도서관" 소장 정보가 같은 상세 시트에 구조 변경 없이 얹힌다(`.env.example`·`library-detail.tsx` 주석 참고).

## 캐싱 (콜드 스타트 방어)

- **디렉터리**(info_v2): `fetch(next:{revalidate: KST자정까지})` + CDN `s-maxage`/SWR. 하루 1콜.
- **좌석**(rlt_rdrm): `revalidate: 60`. 업스트림 최대 ~1,440콜/일(오퍼 신청량 5,000/일의 29%).
- 실패는 **캐시하지 않는다**. 좌석이 실패해도 목록·지도는 살아 있다(별도 상태).
- 크론 `/api/warm`(UTC 15:00 = KST 자정 직후)이 양쪽을 예열.

## 개발

```bash
npm install
cp .env.example .env.local   # DATA_GO_KR_KEY(Encoding 키, verbatim), CRON_SECRET 채우기
npm run dev                  # http://localhost:3000
npm test                     # 파서·거리·KST·필터·좌석상태 단위 테스트
npm run build
```

### 환경변수

| 이름 | 용도 |
|---|---|
| `DATA_GO_KR_KEY` | data.go.kr 서비스키(15142580 활용신청). **Encoding 키를 verbatim** 으로. 재인코딩 시 code 30. |
| `CRON_SECRET` | `/api/warm` 크론 인증(Bearer). 없으면 503(fail closed). |
| `DATA4LIBRARY_KEY` | (선택·미래) 정보나루 책 소장 기능용. 현재 미사용. |

## 함정 (형제앱들이 데인 것)

1. **키 인코딩**: Encoding 키는 쿼리스트링에 verbatim. `URLSearchParams` 에 넣으면 재인코딩되어 code 30(미신청과 구분 안 됨).
2. **MapLibre v5**: v6 는 Turbopack 워커 로딩 실패로 지도가 조용히 안 뜬다.
3. **200 ≠ 성공**: 본문 `resultCode`(정상 `K0`/`00`)로 판정. 키 에러는 `OpenAPI_ServiceResponse.cmmMsgHeader`.
4. **`pblibId` 는 도서관별 로컬 순번**(PLR001…). 도서관 식별은 `시도+이름`(`lclgvNm|pblibNm`).
5. **`prst_info_v2` 는 비어 있다**(totalCount 0). 좌석 수치는 `rlt_rdrm_info_v2` 에서.

## 배포

Vercel, `regions: ["icn1"]`(서울). `CRON_SECRET`·`DATA_GO_KR_KEY` 는 프로젝트 환경변수로 주입.

데이터 출처: 행정안전부 한국지역정보개발원 · 좌표 WGS84.
