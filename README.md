# 매칭 프로그램 개선 사항

## 개요
매칭 완료 상태를 "매칭 완료"와 "추가 매칭 완료"로 구분하여 표시하도록 개선했습니다.

## 주요 변경 사항

### 1. 이번주 서로 소개된 회원 간 매칭 완료
- **BEFORE**: 모든 매칭 완료가 동일하게 표시됨
- **AFTER**: 
  - 회원카드 버튼: 녹색 버튼 "매칭 완료. 정보 확인"
  - index.html의 [이번주 소개]: "test2 · 대상 test1 2025. 12. 7. 오전 12:16:09 · 매칭 완료"

### 2. 이번주 서로 소개되지 않은 회원 간 매칭 완료
- **BEFORE**: 추가 매칭 완료가 올바르게 구분되지 않음
- **AFTER**:
  - 회원카드 버튼: 분홍색 버튼 "추가 매칭 완료. 정보 확인"
  - index.html의 [이번주 소개]: "test3 · 대상 test1 2025. 12. 7. 오전 12:16:09 · 추가 매칭 완료"

### 3. 나와 연결되고 싶은 사람 목록 유지
- **BEFORE**: 페이지 새로고침 시 "나와 연결되고 싶은 사람" 목록이 사라질 수 있음
- **AFTER**: 페이지 새로고침 후에도 "나와 연결되고 싶은 사람" 목록이 계속 표시됨 (localStorage 기반 영구 저장)

### 4. 매칭 상태 표시 개선
- **BEFORE**: 매칭 선택 시 상태 표시가 불명확함
- **AFTER**:
  - 매칭 선택하기 버튼 클릭 → [이번주 소개]에 "선택 완료" 표시
  - 매칭 완료 시 → "매칭 완료" 또는 "추가 매칭 완료"로 자동 변경

## 기술적 변경 사항

### apply.html

#### 1. `checkIfThisWeekIntro()` 함수 추가
```javascript
// BEFORE: 함수 없음

// AFTER:
function checkIfThisWeekIntro(candidateId) {
  // 이번주 소개 목록(matches)에 있는지 확인
  const candidateKey = normalizeCandidateKey(candidateId)
  if (!candidateKey || !matchState.currentDeckIds) return false
  return matchState.currentDeckIds.has(candidateKey)
}
```

#### 2. `isExtraMatchCandidate()` 함수 수정
```javascript
// BEFORE:
function isExtraMatchCandidate(candidateId) {
  const key = normalizeCandidateKey(candidateId)
  if (!key) return false
  const req = matchState.incomingById.get(key)
  if (!req) return false
  if (req.extraMatch !== undefined) {
    return Boolean(req.extraMatch)
  }
  return String(req?.status || '').toLowerCase() === 'confirmed'
}

// AFTER:
function isExtraMatchCandidate(candidateId) {
  const key = normalizeCandidateKey(candidateId)
  if (!key) return false
  // 이번주 서로 소개된 회원인지 확인
  const isThisWeekIntro = checkIfThisWeekIntro(key)
  if (isThisWeekIntro) return false // 이번주 서로 소개된 경우 extraMatch 아님
  const req = matchState.incomingById.get(key)
  if (!req) return false
  if (req.extraMatch !== undefined) {
    return Boolean(req.extraMatch)
  }
  return String(req?.status || '').toLowerCase() === 'confirmed'
}
```

#### 3. `handleCardMatchSelect()` 함수 수정
```javascript
// BEFORE:
const payload = buildMatchSelectionPayload(record, candidateId, resolvedMatchEntryId, {
  categoryOverride: incomingRequest ? 'confirmed' : 'intro',
  extraMatch: hasIncomingRequest,
})

// AFTER:
const hasIncomingRequest = Boolean(incomingRequest)
const isExtraMatch = hasIncomingRequest ? !checkIfThisWeekIntro(candidateKey) : false
const payload = buildMatchSelectionPayload(record, candidateId, resolvedMatchEntryId, {
  categoryOverride: incomingRequest ? 'confirmed' : 'intro',
  extraMatch: isExtraMatch,
})
```

#### 4. `recordMutualMatchForRequester()` 함수 수정
```javascript
// BEFORE:
const payload = {
  id: `${requesterId}-${viewerId}-${matchedAt}-mutual`,
  candidateId: viewerId,
  targetId: requesterId,
  targetPhone,
  matchedAt,
  week: buildWeekMeta(new Date(matchedAt)),
  category: 'confirmed',
  candidateName: currentTargetProfile.name || '',
  candidateGender: currentTargetProfile.gender || '',
  candidatePhone: viewerPhone,
  targetName: contactSource?.name || incomingRequest.profile?.name || '',
  targetGender: incomingRequest.profile?.gender || '',
  targetSelected: true,
}

// AFTER:
// 이번주 서로 소개된 회원인지 확인
const isExtraMatch = !checkIfThisWeekIntro(requesterId)
const payload = {
  id: `${requesterId}-${viewerId}-${matchedAt}-mutual`,
  candidateId: viewerId,
  targetId: requesterId,
  targetPhone,
  matchedAt,
  week: buildWeekMeta(new Date(matchedAt)),
  category: 'confirmed',
  candidateName: currentTargetProfile.name || '',
  candidateGender: currentTargetProfile.gender || '',
  candidatePhone: viewerPhone,
  targetName: contactSource?.name || incomingRequest.profile?.name || '',
  targetGender: incomingRequest.profile?.gender || '',
  targetSelected: true,
  extraMatch: isExtraMatch,
}
```

#### 5. `renderMatches()` 함수 수정
```javascript
// BEFORE:
const isExtraMatch = Boolean(incomingRequestForCard && isIncomingConfirmed)

// AFTER:
// 이번주 서로 소개된 회원인지 확인하여 extraMatch 결정
const isExtraMatch = isIncomingConfirmed && candidateId ? !checkIfThisWeekIntro(candidateId) : false
```

#### 6. `handleRealtimeMatchConfirmed()` 함수 수정
```javascript
// BEFORE:
const extraMatch =
  entry.extraMatch !== undefined
    ? Boolean(entry.extraMatch) || isExtraMatchCandidate(candidateKey)
    : isExtraMatchCandidate(candidateKey)

// AFTER:
// 서버에서 전달된 extraMatch 값이 있으면 우선 사용, 없으면 이번주 소개 여부로 판단
const extraMatch =
  entry.extraMatch !== undefined
    ? Boolean(entry.extraMatch)
    : isExtraMatchCandidate(candidateKey)
```

### dashboard.js

#### `getMatchHistoryStatusLabel()` 함수 수정
```javascript
// BEFORE:
function getMatchHistoryStatusLabel(entry) {
  if (isConfirmedMatchEntry(entry)) {
    return entry?.extraMatch ? '추가 매칭 완료' : '매칭 완료'
  }
  if (entry?.targetSelected) {
    return '선택 완료'
  }
  return ''
}

// AFTER:
function getMatchHistoryStatusLabel(entry) {
  if (isConfirmedMatchEntry(entry)) {
    // extraMatch가 명시적으로 true인 경우에만 "추가 매칭 완료"
    // extraMatch가 false이거나 undefined인 경우 "매칭 완료"
    return entry?.extraMatch === true ? '추가 매칭 완료' : '매칭 완료'
  }
  if (entry?.targetSelected) {
    return '선택 완료'
  }
  return ''
}
```

## 테스트 시나리오

### 시나리오 1: 이번주 서로 소개된 회원 간 매칭
1. test1과 test2가 이번주 서로 소개됨
2. apply.html에서 test1이 test2를 선택
3. test2도 test1을 선택하여 매칭 완료
4. **결과**: 
   - test1의 회원카드에 녹색 버튼 "매칭 완료. 정보 확인" 표시
   - index.html의 [이번주 소개]에 "test2 · 대상 test1 [날짜] · 매칭 완료" 표시

### 시나리오 2: 이번주 서로 소개되지 않은 회원 간 매칭
1. test1에게만 test3 소개 (test3에게는 test1이 소개되지 않음)
2. apply.html에서 test1이 test3를 선택
3. test3의 "나와 연결되고 싶은 사람"에서 test1을 선택
4. **결과**:
   - test1의 회원카드에 분홍색 버튼 "추가 매칭 완료. 정보 확인" 표시
   - index.html의 [이번주 소개]에 "test3 · 대상 test1 [날짜] · 추가 매칭 완료" 표시

### 시나리오 3: 나와 연결되고 싶은 사람 목록 유지
1. apply.html에서 "나와 연결되고 싶은 사람" 목록 확인
2. 페이지 새로고침
3. **결과**: "나와 연결되고 싶은 사람" 목록이 계속 표시됨

### 시나리오 4: 매칭 상태 표시
1. apply.html에서 매칭 선택하기 버튼 클릭
2. **결과**: index.html의 [이번주 소개]에 "선택 완료" 표시
3. 상대방도 선택하여 매칭 완료
4. **결과**: "매칭 완료" 또는 "추가 매칭 완료"로 자동 변경

## 파일 변경 목록

- `apply.html`: 매칭 로직 개선 (이번주 소개 여부 확인, extraMatch 설정)
- `dashboard.js`: 상태 라벨 표시 로직 개선
- `server.js`: extraMatch 필드 처리 확인 (이미 올바르게 구현됨)

## 주의사항

- 이번주 소개 여부는 `matchState.currentDeckIds` Set을 통해 확인됩니다
- "나와 연결되고 싶은 사람" 목록은 localStorage에 저장되어 새로고침 후에도 유지됩니다
- extraMatch는 명시적으로 `true`일 때만 "추가 매칭 완료"로 표시됩니다

