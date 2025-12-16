#!/usr/bin/env node
/**
 * match-history.json extraMatch 정리 스크립트
 *
 * 규칙(요구사항 반영):
 * - 같은 주(weekKey) 내 확정(confirmed) 커플 A<->B에 대해
 *   - A가 B를 "이번주 소개"로 받았는지: intro(=category !== confirmed) 중 targetId=A, candidateId=B 존재 여부
 *   - B가 A를 "이번주 소개"로 받았는지: intro 중 targetId=B, candidateId=A 존재 여부
 *   - 둘 다 소개됨: extraMatch=false (일반 매칭)
 *   - 한쪽만 소개됨: extraMatch=true (추가 매칭)
 * - intro 정보가 둘 다 없으면 추정 불가 → 기존 extraMatch 유지
 *
 * 기본은 dry-run이며, --write 옵션을 줘야 실제 파일을 수정합니다.
 * 수정 시 백업 파일을 함께 생성합니다.
 */

const fs = require('fs')
const path = require('path')

function parseArgs(argv) {
  const args = {
    file: 'data/match-history.json',
    write: false,
  }
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === '--file' && argv[i + 1]) {
      args.file = argv[i + 1]
      i += 1
      continue
    }
    if (token === '--write') {
      args.write = true
      continue
    }
    if (token === '--dry-run') {
      args.write = false
      continue
    }
  }
  return args
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

function buildWeekKey(week) {
  if (!week || typeof week !== 'object') return ''
  const year = Number(week.year)
  const weekNo = Number(week.week)
  if (!Number.isFinite(year) || !Number.isFinite(weekNo)) return ''
  return `${year}-W${pad2(weekNo)}`
}

function getWeekInfoFromDate(dateInput) {
  const date = new Date(dateInput)
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const utcDay = utcDate.getUTCDay() || 7
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - utcDay)
  const isoYear = utcDate.getUTCFullYear()
  const yearStart = new Date(Date.UTC(isoYear, 0, 1))
  const weekNo = Math.ceil(((utcDate - yearStart) / 86400000 + 1) / 7)
  return { year: isoYear, week: weekNo }
}

function computeEntryWeekKey(entry) {
  const direct = buildWeekKey(entry?.week)
  if (direct) return direct
  const matchedAt = Number(entry?.matchedAt)
  if (Number.isFinite(matchedAt) && matchedAt > 0) {
    const { year, week } = getWeekInfoFromDate(new Date(matchedAt))
    return `${year}-W${pad2(week)}`
  }
  return ''
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function isConfirmed(entry) {
  const category = normalizeText(entry?.category).toLowerCase()
  return category === 'confirmed'
}

function pairKey(a, b) {
  const left = normalizeText(a)
  const right = normalizeText(b)
  if (!left || !right) return ''
  return left < right ? `${left}::${right}` : `${right}::${left}`
}

function main() {
  const args = parseArgs(process.argv)
  const filePath = path.resolve(process.cwd(), args.file)
  if (!fs.existsSync(filePath)) {
    console.error(`[migrate] 파일을 찾을 수 없습니다: ${filePath}`)
    process.exit(1)
  }

  const raw = fs.readFileSync(filePath, 'utf-8')
  let list
  try {
    list = JSON.parse(raw)
  } catch (e) {
    console.error('[migrate] JSON 파싱 실패:', e?.message || e)
    process.exit(1)
  }
  if (!Array.isArray(list)) {
    console.error('[migrate] match-history.json은 배열이어야 합니다.')
    process.exit(1)
  }

  // intro 인덱스: weekKey|targetId|candidateId
  const introIndex = new Set()
  list.forEach((entry) => {
    if (!entry) return
    if (isConfirmed(entry)) return
    const weekKey = computeEntryWeekKey(entry)
    const targetId = normalizeText(entry.targetId)
    const candidateId = normalizeText(entry.candidateId)
    if (!weekKey || !targetId || !candidateId) return
    introIndex.add(`${weekKey}|${targetId}|${candidateId}`)
  })

  // confirmed 그룹: weekKey + pairKey
  const groups = new Map()
  list.forEach((entry, idx) => {
    if (!entry || !isConfirmed(entry)) return
    const weekKey = computeEntryWeekKey(entry)
    const targetId = normalizeText(entry.targetId)
    const candidateId = normalizeText(entry.candidateId)
    const pk = pairKey(targetId, candidateId)
    if (!weekKey || !pk || !targetId || !candidateId) return
    const key = `${weekKey}|${pk}`
    if (!groups.has(key)) {
      groups.set(key, { weekKey, pk, entries: [] })
    }
    groups.get(key).entries.push({ entry, idx, targetId, candidateId })
  })

  let changed = 0
  let inferredPairs = 0
  let skippedPairs = 0
  const changeLog = []

  groups.forEach((group) => {
    const entries = group.entries
    if (!entries.length) return
    // 동일 커플은 보통 2개 엔트리(양방향)지만, 혹시 1개/3개 이상이어도 안전하게 처리
    const a = entries[0].targetId
    const b = entries[0].candidateId
    const pk = pairKey(a, b)
    if (!pk) return
    const [left, right] = pk.split('::')

    const introLeftToRight = introIndex.has(`${group.weekKey}|${left}|${right}`)
    const introRightToLeft = introIndex.has(`${group.weekKey}|${right}|${left}`)

    let desiredExtra = null
    if (introLeftToRight && introRightToLeft) {
      desiredExtra = false
    } else if (introLeftToRight || introRightToLeft) {
      desiredExtra = true
    } else {
      skippedPairs += 1
      return
    }

    inferredPairs += 1
    entries.forEach(({ entry, idx }) => {
      const current = Boolean(entry.extraMatch)
      if (current === desiredExtra) return
      entry.extraMatch = desiredExtra
      changed += 1
      changeLog.push({
        id: entry.id,
        weekKey: group.weekKey,
        targetId: entry.targetId,
        candidateId: entry.candidateId,
        before: current,
        after: desiredExtra,
      })
    })
  })

  console.log('[migrate] 요약')
  console.log(`- 파일: ${filePath}`)
  console.log(`- confirmed 그룹 수: ${groups.size}`)
  console.log(`- intro 기반 추정 가능 그룹: ${inferredPairs}`)
  console.log(`- intro 정보 부족으로 스킵한 그룹: ${skippedPairs}`)
  console.log(`- 변경된 엔트리 수(extraMatch 토글): ${changed}`)

  if (changeLog.length) {
    console.log('\n[migrate] 변경 예시(최대 20개):')
    changeLog.slice(0, 20).forEach((row, i) => {
      console.log(
        ` ${i + 1}. ${row.weekKey} ${row.targetId} -> ${row.candidateId} (${row.id}) : ${row.before} -> ${row.after}`,
      )
    })
    if (changeLog.length > 20) {
      console.log(` ... 총 ${changeLog.length}개 변경`)
    }
  }

  if (!args.write) {
    console.log('\n[migrate] dry-run 모드입니다. 실제 반영하려면 --write 옵션을 붙이세요.')
    return
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = `${filePath}.bak-${stamp}`
  fs.copyFileSync(filePath, backupPath)
  fs.writeFileSync(filePath, JSON.stringify(list, null, 2), 'utf-8')
  console.log('\n[migrate] 반영 완료')
  console.log(`- 백업: ${backupPath}`)
}

main()


