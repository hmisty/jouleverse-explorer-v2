import { describe, it, expect } from 'vitest'
import {
  parseRecipient,
  resolveRecipient,
  makeJnsLookup,
  ZERO_ADDRESS,
  type JnsLookup,
} from '../src/utils/recipient-resolve'

const ADDR = '0x3d86b1e5c8ed9c9a4d2f9e1a58b0c7a4b9f7a20c' as const

/** 假的 `.j` 查询：按 name 返回预设结果，未知名字当「不存在」 */
function fakeLookup(table: Record<string, JnsLookup | 'THROW'>) {
  return async (name: string): Promise<JnsLookup> => {
    const hit = table[name]
    if (hit === 'THROW') throw new Error('rpc timeout')
    if (!hit) return { tokenId: 0n, bound: null }
    return hit
  }
}

describe('parseRecipient 分类', () => {
  it('空输入与纯空白 → empty', () => {
    expect(parseRecipient('').kind).toBe('empty')
    expect(parseRecipient('   ').kind).toBe('empty')
    expect(parseRecipient(null).kind).toBe('empty')
    expect(parseRecipient(undefined).kind).toBe('empty')
  })

  it('HEX 地址 → address，格式标记为 hex', () => {
    const r = parseRecipient(ADDR)
    expect(r.kind).toBe('address')
    if (r.kind === 'address') {
      expect(r.address).toBe(ADDR)
      expect(r.format).toBe('hex')
    }
  })

  it('大小写混合的 HEX 地址正常识别', () => {
    const r = parseRecipient('0x3D86B1e5C8Ed9c9A4D2f9E1A58b0C7A4B9F7A20C')
    expect(r.kind).toBe('address')
  })

  it('以 .j 结尾 → jns，label 保留后缀', () => {
    const r = parseRecipient('alice.j')
    expect(r.kind).toBe('jns')
    if (r.kind === 'jns') {
      expect(r.name).toBe('alice')
      expect(r.label).toBe('alice.j')
    }
  })

  it('.j 后缀大小写都接受（后缀不属于域名本体）', () => {
    const r = parseRecipient('alice.J')
    expect(r.kind).toBe('jns')
    if (r.kind === 'jns') expect(r.name).toBe('alice')
  })

  it('裸 .j → invalid（后缀前为空）', () => {
    const r = parseRecipient('.j')
    expect(r.kind).toBe('invalid')
  })

  it('域名含空格 → invalid', () => {
    const r = parseRecipient('ali ce.j')
    expect(r.kind).toBe('invalid')
  })

  it('🔴 .j 判定先于地址判定：以 .j 结尾的 40 位 j3 串仍当域名', () => {
    // 40 位、以 j3 开头（合法 B32 形态），但结尾是 .j —— 两个集合互斥，
    // 顺序写反会让它掉进地址分支并被静默接受成「无效地址」以外的结果
    const s = 'j3' + 'q'.repeat(36) + '.j'
    expect(s.length).toBe(40)
    const r = parseRecipient(s)
    expect(r.kind).toBe('jns')
  })

  it('🟡 40 位以 j3 开头的合法 B32 地址仍走 address 分支', () => {
    const b32 = 'j3' + 'q'.repeat(38)
    expect(b32.length).toBe(40)
    // 这是 b32 形态，normalizeToHex 能否解出取决于校验位；分类至少不能是 jns
    expect(parseRecipient(b32).kind).not.toBe('jns')
  })

  it('既不是地址也不以 .j 结尾 → invalid，理由里点明两种可接受形态', () => {
    const r = parseRecipient('hello')
    expect(r.kind).toBe('invalid')
    if (r.kind === 'invalid') {
      expect(r.reason).toContain('HEX')
      expect(r.reason).toContain('.j')
    }
  })

  it('39 位 / 41 位 hex 不算地址', () => {
    expect(parseRecipient('0x' + '1'.repeat(39)).kind).toBe('invalid')
    expect(parseRecipient('0x' + '1'.repeat(41)).kind).toBe('invalid')
  })
})

describe('resolveRecipient 地址直通', () => {
  it('HEX 地址不需要任何 RPC 查询', async () => {
    let called = 0
    const r = await resolveRecipient(ADDR, async () => { called++; return { tokenId: 1n, bound: ADDR } })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.address).toBe(ADDR)
      expect(r.via).toBe('address')
    }
    expect(called).toBe(0)
  })

  it('空输入不发 RPC，返回 empty', async () => {
    let called = 0
    const r = await resolveRecipient('  ', async () => { called++; return { tokenId: 0n, bound: null } })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('empty')
    expect(called).toBe(0)
  })

  it('无效输入不发 RPC', async () => {
    let called = 0
    const r = await resolveRecipient('not-an-address', async () => { called++; return { tokenId: 0n, bound: null } })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('invalid')
    expect(called).toBe(0)
  })
})

describe('resolveRecipient .j 域名', () => {
  it('已绑定的域名 → 解析到绑定地址', async () => {
    const r = await resolveRecipient('alice.j', fakeLookup({
      alice: { tokenId: 7n, bound: ADDR },
    }))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.address).toBe(ADDR)
      expect(r.via).toBe('jns')
      expect(r.display).toContain('alice.j')
      expect(r.display).toContain(ADDR)
    }
  })

  it('域名不存在（tokenId=0）→ jns-not-found', async () => {
    const r = await resolveRecipient('ghost.j', fakeLookup({}))
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.code).toBe('jns-not-found')
      expect(r.message).toContain('不存在')
    }
  })

  it('域名存在但绑定零地址 → jns-unbound', async () => {
    const r = await resolveRecipient('alice.j', fakeLookup({
      alice: { tokenId: 7n, bound: ZERO_ADDRESS },
    }))
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.code).toBe('jns-unbound')
      expect(r.message).toContain('未绑定')
    }
  })

  it('bound 为 null → jns-unbound（不等于「不存在」）', async () => {
    const r = await resolveRecipient('alice.j', fakeLookup({
      alice: { tokenId: 7n, bound: null },
    }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('jns-unbound')
  })

  it('bound 返回非法字符串 → 按未绑定处理，不把脏数据当地址发出去', async () => {
    const r = await resolveRecipient('alice.j', fakeLookup({
      alice: { tokenId: 7n, bound: 'not-an-address' },
    }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('jns-unbound')
  })

  it('🔴 读取失败 → jns-read-failed，且文案明确否认「域名不存在」', async () => {
    // v1 把 RPC 失败说成「无效的JNS域名」，用户会去别的浏览器反复确认一个其实存在的域名。
    // 这条用例锁的是「失败归因」：code 必须是 read-failed，文案必须带上否认句。
    const r = await resolveRecipient('alice.j', fakeLookup({ alice: 'THROW' }))
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.code).toBe('jns-read-failed')
      expect(r.message).toContain('这不代表域名不存在')
      expect(r.message).not.toContain('无效的 JNS 域名')
    }
  })

  it('查询函数返回畸形结果（tokenId 不是 bigint）→ jns-read-failed', async () => {
    const r = await resolveRecipient('alice.j', (async () => ({ tokenId: 7, bound: ADDR })) as never)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('jns-read-failed')
  })
})

describe('makeJnsLookup 链上两步顺序', () => {
  const JNS = '0xf8AbF36Bb2dc525b1E566d6B42F6Fd1BB2035b89' as const
  const ABI = [{ name: '_nslookup' }, { name: '_bound' }] as const

  it('tokenId > 0 时依次调 _nslookup 再 _bound，且 _bound 传的是 tokenId', async () => {
    const calls: { fn: string; args: readonly unknown[] }[] = []
    const client = {
      readContract: async ({ functionName, args }: any) => {
        calls.push({ fn: functionName, args })
        if (functionName === '_nslookup') return 7n
        return ADDR
      },
    }
    const lookup = makeJnsLookup(client as never, JNS, ABI)
    const res = await lookup('alice')

    expect(res).toEqual({ tokenId: 7n, bound: ADDR })
    expect(calls.map((c) => c.fn)).toEqual(['_nslookup', '_bound'])
    expect(calls[0].args).toEqual(['alice'])
    // 🔴 关键：_bound 吃的是 tokenId 不是名字。写反了这里会红，而真机上表现为「未绑定」
    expect(calls[1].args).toEqual([7n])
  })

  it('tokenId = 0 时只发一次 RPC（不查 _bound）', async () => {
    let n = 0
    const client = { readContract: async () => { n++; return 0n } }
    const lookup = makeJnsLookup(client as never, JNS, ABI)
    const res = await lookup('ghost')
    expect(res).toEqual({ tokenId: 0n, bound: null })
    expect(n).toBe(1)
  })

  it('_nslookup 抛错时异常向上传递，由 resolveRecipient 归因为 read-failed', async () => {
    const client = { readContract: async () => { throw new Error('boom') } }
    const lookup = makeJnsLookup(client as never, JNS, ABI)
    await expect(lookup('alice')).rejects.toThrow('boom')
  })
})
