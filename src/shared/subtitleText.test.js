import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseSubtitles, transcriptChunks } from './subtitleText.js'

const srt = `${'\uFEFF'}1
00:00:01,000 --> 00:00:03,500
Hola <i>a todos</i>

2
00:00:03,500 --> 00:00:06,000
Hola a todos
hoy vemos la luz

3
00:00:45,000 --> 00:00:48,000
La luz de recorte separa el objeto.
`

const vtt = `WEBVTT

00:01.000 --> 00:02.000
Primera línea

01:02:03.000 --> 01:02:05.000 align:start
<v Ana>Mucho después</v>
`

describe('subtitles', () => {
  it('parses srt cues, strips tags and repeated rolling lines', () => {
    const cues = parseSubtitles(srt)
    assert.equal(cues.length, 3)
    assert.equal(cues[0].text, 'Hola a todos')
    assert.equal(cues[1].text, 'hoy vemos la luz')
    assert.equal(cues[2].start, 45)
  })

  it('parses vtt with short and long clocks', () => {
    const cues = parseSubtitles(vtt)
    assert.equal(cues.length, 2)
    assert.equal(cues[1].start, 3723)
    assert.equal(cues[1].text, 'Mucho después')
  })

  it('chunks the transcript with clock marks', () => {
    const chunks = transcriptChunks(parseSubtitles(srt), { maxChars: 1000, markEvery: 30 })
    assert.equal(chunks.length, 1)
    assert.match(chunks[0].text, /^\[0:01\] Hola a todos hoy vemos la luz \[0:45\] La luz/)
    const small = transcriptChunks(parseSubtitles(srt), { maxChars: 40 })
    assert.ok(small.length >= 2)
    assert.match(small[1].text, /^\[0:/)
  })
})
