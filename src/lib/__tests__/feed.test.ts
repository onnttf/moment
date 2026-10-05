import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  loadConfig,
  loadSource,
  parseConfig,
  parseNewsList,
  parseSavedIds,
  parseSavedSources,
  pickRandom,
} from '../feed.ts'

const signal = new AbortController().signal
const body = (items: unknown) => ({
  code: 0,
  msg: 'ok',
  data: { items, sources: [], partial: false },
})

test('keeps safe stories, newest first, undated last', () => {
  const articles = parseNewsList(
    body([
      { id: 'a', title: 'No date', url: 'https://example.com/a', published_at: null },
      {
        id: 'b',
        title: ' Older ',
        url: 'https://example.com/b',
        published_at: '2026-10-04T08:00:00Z',
      },
      {
        id: 'c',
        title: 'Newer',
        url: 'https://example.com/c',
        published_at: '2026-10-04T09:00:00+08:00',
      },
      {
        id: 'd',
        title: 'Newest',
        url: 'https://example.com/d',
        published_at: '2026-10-04T10:00:00Z',
      },
    ]),
    3,
  )
  assert.deepEqual(
    articles.map((article) => article.title),
    ['Newest', 'Older', 'Newer'],
  )
  assert.equal(articles[2]!.publishedAt, '2026-10-04T01:00:00.000Z')
  assert.equal(
    parseNewsList(body([{ title: 'x', url: 'https://example.com', published_at: 'nope' }]), 3)[0]!
      .publishedAt,
    null,
  )
})

test('skips items that cannot be shown safely', () => {
  const articles = parseNewsList(
    body([
      null,
      'text',
      { title: 'Script', url: 'javascript:alert(1)' },
      { title: 'Relative', url: '/story' },
      { title: '   ', url: 'https://example.com/blank' },
      { title: 42, url: 'https://example.com/number' },
      { title: 'Kept', url: 'https://example.com/kept' },
      { title: 'Duplicate', url: 'https://example.com/kept' },
    ]),
    10,
  )
  assert.deepEqual(articles, [
    {
      id: 'https://example.com/kept',
      title: 'Kept',
      url: 'https://example.com/kept',
      publishedAt: null,
    },
  ])
})

test('rejects bodies that are not a news list', () => {
  for (const bad of [
    null,
    undefined,
    '<html>',
    [],
    {},
    { code: 500, msg: 'system error', data: null },
    { data: { items: null } },
    { data: { items: {} } },
    { data: [] },
  ]) {
    assert.throws(() => parseNewsList(bad, 3))
  }
  assert.deepEqual(parseNewsList(body([]), 3), [])
})

test('loadSource requests one source and rejects on HTTP or format errors', async () => {
  let requested = ''
  const ok = await loadSource('/api/rss/v1', 'hacker-news', 3, signal, async (url) => {
    requested = String(url)
    return Response.json(body([{ title: 'Story', url: 'https://example.com/s' }]))
  })
  assert.equal(requested, '/api/rss/v1/news/list?source_id=hacker-news&limit=3')
  assert.equal(ok.length, 1)
  await assert.rejects(
    loadSource('/x', 'bbc', 3, signal, async () => new Response('down', { status: 502 })),
  )
  await assert.rejects(
    loadSource('/x', 'bbc', 3, signal, async () => new Response('<html>not json</html>')),
  )
  await assert.rejects(
    loadSource('/x', 'bbc', 3, signal, async () => Response.json({ code: 1, data: null })),
  )
  await assert.rejects(
    loadSource('/x', 'bbc', 3, signal, async () => {
      throw new TypeError('Failed to fetch')
    }),
  )
})

test('parseConfig keeps usable sources and fills a missing name', () => {
  const config = (sources: unknown) => ({ code: 0, data: { sources } })
  assert.deepEqual(
    parseConfig(
      config([
        { source_id: 'sspai', name: 'SSPAI', name_zh: '少数派' },
        { source_id: 'verge', name: ' The Verge ' },
        { source_id: 'zh-only', name_zh: '只有中文' },
        { source_id: 'sspai', name: 'Duplicate', name_zh: '重复' },
        { source_id: 'nameless' },
        { source_id: '', name: 'No id' },
        { name: 'No id' },
        null,
        'text',
      ]),
    ),
    [
      { id: 'sspai', name: 'SSPAI', nameZh: '少数派' },
      { id: 'verge', name: 'The Verge', nameZh: 'The Verge' },
      { id: 'zh-only', name: '只有中文', nameZh: '只有中文' },
    ],
  )
  assert.deepEqual(parseConfig(config([])), [])
  for (const bad of [null, '<html>', {}, { code: 1, data: null }, { data: { sources: {} } }]) {
    assert.throws(() => parseConfig(bad))
  }
})

test('loadConfig requests the config and rejects on errors', async () => {
  let requested = ''
  const sources = await loadConfig('/api/rss/v1', signal, async (url) => {
    requested = String(url)
    return Response.json({ data: { sources: [{ source_id: 'bbc', name: 'BBC World' }] } })
  })
  assert.equal(requested, '/api/rss/v1/config')
  assert.deepEqual(sources, [{ id: 'bbc', name: 'BBC World', nameZh: 'BBC World' }])
  await assert.rejects(loadConfig('/x', signal, async () => new Response('down', { status: 500 })))
  await assert.rejects(loadConfig('/x', signal, async () => new Response('<html>')))
})

test('saved values are read defensively', () => {
  const sources = [{ id: 'bbc', name: 'BBC World', nameZh: 'BBC 国际' }]
  assert.deepEqual(parseSavedSources(JSON.stringify(sources)), sources)
  assert.deepEqual(parseSavedSources(JSON.stringify([...sources, { id: 'x' }, null, 3])), sources)
  assert.deepEqual(parseSavedIds('["bbc",3,null,"verge"]'), ['bbc', 'verge'])
  for (const bad of [null, '', '{', '"text"', '{"a":1}', '42']) {
    assert.deepEqual(parseSavedSources(bad), [])
    assert.deepEqual(parseSavedIds(bad), [])
  }
})

test('pickRandom returns distinct items and never more than there are', () => {
  const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
  for (let round = 0; round < 50; round++) {
    const picked = pickRandom(items, 5)
    assert.equal(picked.length, 5)
    assert.equal(new Set(picked).size, 5)
    assert.ok(picked.every((item) => items.includes(item)))
  }
  assert.deepEqual(items, ['a', 'b', 'c', 'd', 'e', 'f', 'g'])
  assert.deepEqual(
    pickRandom(items, 3, () => 0),
    ['a', 'b', 'c'],
  )
  assert.deepEqual(
    pickRandom(items, 2, () => 0.999),
    ['g', 'a'],
  )
  assert.equal(pickRandom(['a', 'b'], 5).length, 2)
  assert.deepEqual(pickRandom([], 5), [])
  assert.deepEqual(pickRandom(items, 0), [])
})
