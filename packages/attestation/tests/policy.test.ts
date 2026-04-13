import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { acceptedTcbStatuses, isAcceptableTcb } from '../src/policy.js'

describe('policy', () => {
  const original = process.env.TCB_ACCEPTED_STATUSES

  beforeEach(() => {
    delete process.env.TCB_ACCEPTED_STATUSES
  })

  afterEach(() => {
    if (original === undefined) delete process.env.TCB_ACCEPTED_STATUSES
    else process.env.TCB_ACCEPTED_STATUSES = original
  })

  it('defaults to UpToDate only', () => {
    expect(isAcceptableTcb('UpToDate')).toBe(true)
    expect(isAcceptableTcb('SWHardeningNeeded')).toBe(false)
    expect(isAcceptableTcb('OutOfDate')).toBe(false)
    expect(isAcceptableTcb('Revoked')).toBe(false)
  })

  it('accepts multiple statuses when configured', () => {
    process.env.TCB_ACCEPTED_STATUSES = 'UpToDate,SWHardeningNeeded'
    expect(isAcceptableTcb('UpToDate')).toBe(true)
    expect(isAcceptableTcb('SWHardeningNeeded')).toBe(true)
    expect(isAcceptableTcb('OutOfDate')).toBe(false)
  })

  it('tolerates whitespace and empty entries', () => {
    process.env.TCB_ACCEPTED_STATUSES = ' UpToDate , ,SWHardeningNeeded , '
    const set = acceptedTcbStatuses()
    expect(set.size).toBe(2)
    expect(set.has('UpToDate')).toBe(true)
    expect(set.has('SWHardeningNeeded')).toBe(true)
  })

  it('falls back to default when env is empty string', () => {
    process.env.TCB_ACCEPTED_STATUSES = ''
    expect(isAcceptableTcb('UpToDate')).toBe(true)
    expect(isAcceptableTcb('SWHardeningNeeded')).toBe(false)
  })

  it('falls back to default when env is only whitespace/commas', () => {
    process.env.TCB_ACCEPTED_STATUSES = ' , , '
    expect(isAcceptableTcb('UpToDate')).toBe(true)
    expect(isAcceptableTcb('SWHardeningNeeded')).toBe(false)
  })
})
