import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadSource, parseNewsList } from '../feed.ts'

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
  const ok = await loadSource('/api/rss/v1/news/list', 'hacker-news', 3, signal, async (url) => {
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
