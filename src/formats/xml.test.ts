import { describe, expect, it } from 'vitest'
import { FormatError } from './errors'
import { attributeOf, escapeAttribute, escapeText, parseXml, type XmlElement, xmlSafe } from './xml'

const parse = (text: string) => parseXml('graphml', text)

function failure(text: string): FormatError {
  try {
    parse(text)
  } catch (error) {
    if (error instanceof FormatError) return error
    throw error
  }
  throw new Error('expected a FormatError')
}

describe('parseXml', () => {
  it('reads elements, attributes and text', () => {
    const root = parse('<?xml version="1.0"?>\n<a x="1" y=\'two\'>\n  <b>hello</b>\n  <c/>\n</a>')
    expect(root.name).toBe('a')
    expect(attributeOf(root, 'x')).toBe('1')
    expect(attributeOf(root, 'y')).toBe('two')
    expect(attributeOf(root, 'z')).toBeUndefined()
    expect(root.children.map((child) => child.name)).toEqual(['b', 'c'])
    expect(root.text).toBe('')
    expect((root.children[0] as XmlElement).text).toBe('hello')
  })

  it('decodes predefined entities and character references', () => {
    const root = parse('<a v="&lt;&amp;&gt;&quot;&apos;">&#65;&#x42;&#x1F600; &amp;amp;</a>')
    expect(attributeOf(root, 'v')).toBe('<&>"\'')
    expect(root.text).toBe('AB\u{1F600} &amp;')
  })

  it('keeps CDATA as it is, entities included', () => {
    const root = parse('<a><![CDATA[<b>&amp;</b> ]]>tail</a>')
    expect(root.text).toBe('<b>&amp;</b> tail')
  })

  it('skips comments, processing instructions, a byte order mark and a document type', () => {
    const root = parse(
      '﻿<?xml version="1.0"?><!DOCTYPE a [ <!ENTITY e "x"> ]><!-- c --><a><!-- <b/> --><?pi x?>t</a>',
    )
    expect(root.children).toEqual([])
    expect(root.text).toBe('t')
  })

  it('normalizes line breaks in text and white space in attribute values', () => {
    const root = parse('<a v="x\r\ny\tz&#10;w">one\r\ntwo\rthree</a>')
    expect(attributeOf(root, 'v')).toBe('x y z\nw')
    expect(root.text).toBe('one\ntwo\nthree')
  })

  it('strips namespace prefixes and drops namespace declarations', () => {
    const root = parse('<g:a xmlns:g="urn:g" xmlns="urn:x" g:v="1"><viz:color r="1"/></g:a>')
    expect(root.name).toBe('a')
    expect(root.attributes).toEqual(['v', '1'])
    expect((root.children[0] as XmlElement).name).toBe('color')
  })

  it('drops white space around child elements but keeps the text of leaves', () => {
    const root = parse('<a>\n  <b>  spaced  </b>\n  <c>   </c>\n</a>')
    expect(root.text).toBe('')
    expect(root.children.map((child) => child.text)).toEqual(['  spaced  ', '   '])
  })

  it('throws with a line and a column on malformed documents', () => {
    const cases: [string, RegExp][] = [
      ['<a>\n<b></a>', /expected <\/b>, found <\/a> at line 2, column 4/],
      ['<a>&nope;</a>', /unknown entity &nope;/],
      ['<a>& b</a>', /malformed entity reference/],
      ['<a>&#0;</a>', /invalid character reference/],
      ['<a><b>', /unclosed element <b>/],
      ['<a/><b/>', /more than one root element/],
      ['text<a/>', /text outside the root element/],
      ['<a x="1" x="2"/>', /duplicate attribute x/],
      ['<a x="<"/>', /'<' in an attribute value/],
      ['<a x=1/>', /expected a quoted attribute value/],
      ['<a x="1/>', /unterminated attribute value/],
      ['<a><!-- x </a>', /unterminated comment/],
      ['<a><![CDATA[ x </a>', /unterminated CDATA section/],
      ['', /no root element/],
      ['<1a/>', /expected an element name/],
      ['<a b/>', /expected '='/],
      ['</a>', /unexpected closing tag/],
    ]
    for (const [text, message] of cases) {
      const error = failure(text)
      expect(error.message, text).toMatch(message)
      expect(error.message.startsWith('graphml: '), text).toBe(true)
    }
    expect(failure('<a>\n  <b></a>').line).toBe(2)
    expect(failure('<a>\n  <b></a>').column).toBe(6)
  })

  it('never expands entities declared in a document type', () => {
    expect(failure('<!DOCTYPE a [ <!ENTITY big "x"> ]><a>&big;</a>').message).toMatch(
      /unknown entity &big;/,
    )
  })
})

describe('escaping', () => {
  it('writes text and attribute values that read back the same', () => {
    const value = 'a & b < c > d " e \' f\tg\nh\r\ni ]]>'
    const root = parse(`<a v="${escapeAttribute(value)}">${escapeText(value)}</a>`)
    expect(attributeOf(root, 'v')).toBe(value)
    expect(root.text).toBe(value)
  })

  it('replaces characters that XML cannot hold', () => {
    expect(xmlSafe('a\u0000b\u0007c\ud800d￿')).toBe('a�b�c�d�')
    expect(xmlSafe('ok \u{1F600}\t\n')).toBe('ok \u{1F600}\t\n')
  })
})
