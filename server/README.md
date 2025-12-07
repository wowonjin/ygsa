# server/ 디렉터리

## 현재 사용법

```bash
# package.json 변경:
# "start": "node server/index.js"

npm start
```

## 구조

- `server/index.js` - 서버 진입점 (기존 server.js를 wrapper로 실행)
- `server/config/` - 상수 및 설정 (참고용)
- `server/routes/` - 라우터 (참고용)
- `server/services/` - 서비스 레이어 (참고용)
- `server/repositories/` - 데이터 접근 (참고용)
- `server/utils/` - 유틸리티 (참고용)
- `server/middleware/` - 미들웨어 (참고용)

## 현재 상태

✅ `server/index.js` - 기존 `server.js`를 require해서 실행
📁 리팩토링된 파일들 - 참고용으로 보관됨

## 향후 계획

점진적으로 기존 `server.js`의 로직을 리팩토링된 파일들로 이동할 예정입니다.
