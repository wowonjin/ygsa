#!/usr/bin/env node
/**
 * match-history.json 과거 데이터 전수조사/정리 스크립트
 *
 * 목적:
 * - 과거 매칭 기록에 candidateName/Phone/Gender 또는 targetName/Phone/Gender, week 정보가 누락되어
 *   관리자 대시보드(index.html)의 "이번주 소개/나를 선택한 사람" 카드가 비거나 깨지는 문제를 해결.
 *
 * 동작:
 * - consultations.json(회원 원본)과 match-history.json(매칭 기록)을 읽어,
 *   1) candidate/target을 id/전화번호로 찾아 누락된 필드를 채움
 *   2) candidateId/targetId가 전화번호로 저장된 경우, 해당 회원 id로 정규화(옵션)
 *   3) week(startTime/endTime/year/week/label) 보강
 * - 기본은 dry-run이며, --write 옵션을 줘야 실제 파일 수정 + 백업 생성
 *
 * 사용 예시:
 *   node scripts/audit-backfill-match-history.js --dry-run
 *   node scripts/audit-backfill-match-history.js --write
 *   node scripts/audit-backfill-match-history.js --matchFile data/match-history.json --consultFile data/consultations.json --write
 *   node scripts/audit-backfill-match-history.js --normalize-ids --write
 */

const fs = require('fs')
const path = require('path')

function parseArgs(argv) {
  const args = {
    matchFile: 'data/match-history.json',
    consultFile: 'data/consultations.json',
    write: false,
    normalizeIds: false,
    help: false,
  }
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === '--help' || token === '-h') {
      args.help = true
      continue
    }
    if (token === '--matchFile' && argv[i + 1]) {
      args.matchFile = argv[i + 1]
      i += 1
      continue
    }
    if (token === '--consultFile' && argv[i + 1]) {
      args.consultFile = argv[i + 1]
      i += 1
      continue
    }
    if (token === '--write') args.write = true
    if (token === '--dry-run') args.write = false
    if (token === '--normalize-ids') args.normalizeIds = true
  }
  return args
}

function printHelp() {
  console.log(`
[audit-backfill-match-history]
과거 match-history.json 데이터의 week / candidateName·Phone·Gender / targetName·Phone·Gender 누락을 consultations.json 기준으로 보강합니다.

사용:
  node scripts/audit-backfill-match-history.js --dry-run
  node scripts/audit-backfill-match-history.js --write
  node scripts/audit-backfill-match-history.js --consultFile <path> --matchFile <path> --write
  node scripts/audit-backfill-match-history.js --normalize-ids --write

옵션:
  --consultFile <path>    기본: data/consultations.json
  --matchFile <path>      기본: data/match-history.json
  --write                 실제 파일 수정 + 백업 생성
  --dry-run               (기본) 변경사항만 출력
  --normalize-ids         candidateId/targetId가 '전화번호'로 들어간 경우 회원 id로 정규화
  --help, -h              도움말 출력
`)
}

function resolveExistingPath(cwd, candidatePaths) {
  for (const rel of candidatePaths) {
    const abs = path.resolve(cwd, rel)
    if (fs.existsSync(abs)) return abs
  }
  return null
}

function pad2(v) {
  return String(v).padStart(2, '0')
}

function normalizeText(v) {
  return String(v ?? '').trim()
}

function normalizePhoneNumber(value) {
  let digits = normalizeText(value).replace(/\D/g, '')
  if (!digits) return ''
  digits = digits.replace(/^00+/, '')
  if (digits.startsWith('82')) {
    const rest = digits.slice(2)
    if (!rest) return ''
    if (rest.startsWith('0')) return rest
    return `0${rest}`
  }
  if (!digits.startsWith('0') && digits.length >= 9 && digits.length <= 11) {
    return `0${digits}`
  }
  return digits
}

function getWeekInfoFromDate(dateInput) {
  const date = new Date(dateInput)
  const day = date.getDay() || 7
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - (day - 1))
  const end = new Date(start)
  end.setDate(start.getDate() + 6)

  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const utcDay = utcDate.getUTCDay() || 7
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - utcDay)
  const isoYear = utcDate.getUTCFullYear()
  const yearStart = new Date(Date.UTC(isoYear, 0, 1))
  const weekNo = Math.ceil(((utcDate - yearStart) / 86400000 + 1) / 7)

  return {
    label: `${isoYear}년 ${pad2(weekNo)}주차`,
    year: isoYear,
    week: weekNo,
    startTime: start.getTime(),
    endTime: end.getTime(),
  }
}

function ensureWeek(entry) {
  const matchedAt = Number(entry?.matchedAt)
  const baseTime = Number.isFinite(matchedAt) && matchedAt > 0 ? matchedAt : Date.now()
  const week = entry?.week && typeof entry.week === 'object' ? entry.week : null
  const hasCore =
    week &&
    Number.isFinite(Number(week.year)) &&
    Number.isFinite(Number(week.week)) &&
    Number.isFinite(Number(week.startTime)) &&
    Number.isFinite(Number(week.endTime))
  if (hasCore) {
    return {
      label: normalizeText(week.label) || `${week.year}년 ${pad2(week.week)}주차`,
      year: Number(week.year),
      week: Number(week.week),
      startTime: Number(week.startTime),
      endTime: Number(week.endTime),
    }
  }
  return getWeekInfoFromDate(new Date(baseTime))
}

function safeReadJson(filePath) {
  if (!fs.existsSync(filePath)) return null
  const raw = fs.readFileSync(filePath, 'utf-8')
  try {
    return JSON.parse(raw)
  } catch (e) {
    return null
  }
}

function buildConsultIndex(consultations) {
  const byId = new Map()
  const byPhone = new Map()
  ;(Array.isArray(consultations) ? consultations : []).forEach((r) => {
    if (!r || typeof r !== 'object') return
    const id = normalizeText(r.id)
    const phone = normalizePhoneNumber(r.phone || r.phoneNumber || '')
    if (id) byId.set(id, r)
    if (phone) byPhone.set(phone, r)
  })
  return { byId, byPhone }
}

function resolveMember({ byId, byPhone }, idOrPhone, phoneHint) {
  const idRaw = normalizeText(idOrPhone)
  const phoneRaw = normalizePhoneNumber(phoneHint || idOrPhone || '')

  if (idRaw && byId.has(idRaw)) return byId.get(idRaw)
  if (phoneRaw && byPhone.has(phoneRaw)) return byPhone.get(phoneRaw)
  const maybePhone = normalizePhoneNumber(idRaw)
  if (maybePhone && byPhone.has(maybePhone)) return byPhone.get(maybePhone)
  return null
}

function main() {
  const args = parseArgs(process.argv)
  if (args.help) {
    printHelp()
    return
  }

  const cwd = process.cwd()
  const matchPath =
    resolveExistingPath(cwd, [args.matchFile, 'data/match-history.json', 'match-history.json']) ||
    path.resolve(cwd, args.matchFile)
  const consultPath =
    resolveExistingPath(cwd, [
      args.consultFile,
      'data/consultations.json',
      'consultations.json',
      'backend/data/consultations.json',
    ]) || path.resolve(cwd, args.consultFile)

  const match = safeReadJson(matchPath)
  if (!Array.isArray(match)) {
    console.error(`[audit] match-history 읽기 실패 또는 배열이 아님: ${matchPath}`)
    process.exit(1)
  }

  const consultations = safeReadJson(consultPath)
  if (!Array.isArray(consultations)) {
    console.error(
      `[audit] consultations 읽기 실패 또는 배열이 아님: ${consultPath}\n` +
        `       (가능한 경로를 자동 탐색했지만 찾지 못했습니다.)\n` +
        `       해결: --consultFile로 실제 consultations.json 경로를 지정하세요.`,
    )
    process.exit(1)
  }

  const index = buildConsultIndex(consultations)

  let changed = 0
  let normalizedIds = 0
  let missingCandidate = 0
  let missingTarget = 0

  const sampleChanges = []

  match.forEach((entry) => {
    if (!entry || typeof entry !== 'object') return

    const before = {
      candidateId: entry.candidateId,
      targetId: entry.targetId,
      candidateName: entry.candidateName,
      candidatePhone: entry.candidatePhone,
      candidateGender: entry.candidateGender,
      targetName: entry.targetName,
      targetPhone: entry.targetPhone,
      targetGender: entry.targetGender,
      week: entry.week,
    }

    // week 보강
    const nextWeek = ensureWeek(entry)
    const weekChanged = JSON.stringify(entry.week || null) !== JSON.stringify(nextWeek || null)
    if (weekChanged) {
      entry.week = nextWeek
    }

    // candidate/target 채우기
    const candidate = resolveMember(index, entry.candidateId, entry.candidatePhone)
    const target = resolveMember(index, entry.targetId, entry.targetPhone)
    if (!candidate) missingCandidate += 1
    if (!target) missingTarget += 1

    if (candidate) {
      const phone = normalizePhoneNumber(candidate.phone || candidate.phoneNumber || '')
      if (!normalizeText(entry.candidateName) && normalizeText(candidate.name)) entry.candidateName = candidate.name
      if (!normalizeText(entry.candidateGender) && normalizeText(candidate.gender)) entry.candidateGender = candidate.gender
      if (!normalizePhoneNumber(entry.candidatePhone) && phone) entry.candidatePhone = phone
      if (args.normalizeIds) {
        const currentId = normalizeText(entry.candidateId)
        if (currentId && currentId !== candidate.id && normalizePhoneNumber(currentId)) {
          entry.candidateId = candidate.id
          normalizedIds += 1
        }
      }
    }

    if (target) {
      const phone = normalizePhoneNumber(target.phone || target.phoneNumber || '')
      if (!normalizeText(entry.targetName) && normalizeText(target.name)) entry.targetName = target.name
      if (!normalizeText(entry.targetGender) && normalizeText(target.gender)) entry.targetGender = target.gender
      if (!normalizePhoneNumber(entry.targetPhone) && phone) entry.targetPhone = phone
      if (args.normalizeIds) {
        const currentId = normalizeText(entry.targetId)
        if (currentId && currentId !== target.id && normalizePhoneNumber(currentId)) {
          entry.targetId = target.id
          normalizedIds += 1
        }
      }
    }

    // 변경 여부 체크
    const after = {
      candidateId: entry.candidateId,
      targetId: entry.targetId,
      candidateName: entry.candidateName,
      candidatePhone: entry.candidatePhone,
      candidateGender: entry.candidateGender,
      targetName: entry.targetName,
      targetPhone: entry.targetPhone,
      targetGender: entry.targetGender,
      week: entry.week,
    }
    const entryChanged = JSON.stringify(before) !== JSON.stringify(after)
    if (entryChanged) {
      changed += 1
      if (sampleChanges.length < 20) {
        sampleChanges.push({
          id: entry.id,
          before,
          after,
        })
      }
    }
  })

  console.log('[audit] 요약')
  console.log(`- match-history: ${matchPath}`)
  console.log(`- consultations: ${consultPath}`)
  console.log(`- 전체 엔트리: ${match.length}`)
  console.log(`- 변경 엔트리: ${changed}`)
  console.log(`- (옵션) id 정규화 횟수: ${normalizedIds}`)
  console.log(`- candidate 미매칭 엔트리: ${missingCandidate}`)
  console.log(`- target 미매칭 엔트리: ${missingTarget}`)

  if (sampleChanges.length) {
    console.log('\n[audit] 변경 예시(최대 5개):')
    sampleChanges.slice(0, 5).forEach((row, idx) => {
      console.log(` ${idx + 1}. id=${row.id || '(no-id)'} candidateName "${row.before.candidateName}" -> "${row.after.candidateName}" / targetName "${row.before.targetName}" -> "${row.after.targetName}"`)
    })
  }

  if (!args.write) {
    console.log('\n[audit] dry-run 모드입니다. 실제 반영하려면 --write 옵션을 붙이세요.')
    if (args.normalizeIds) {
      console.log('[audit] 참고: --normalize-ids는 dry-run에서도 계산되지만 파일에 쓰이지는 않습니다.')
    }
    return
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = `${matchPath}.bak-${stamp}`
  fs.copyFileSync(matchPath, backupPath)
  fs.writeFileSync(matchPath, JSON.stringify(match, null, 2), 'utf-8')
  console.log('\n[audit] 반영 완료')
  console.log(`- 백업: ${backupPath}`)
}

main()


