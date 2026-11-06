import { describe, expect, it } from 'vitest'
import { defineGraph } from '../define-graph'
import { nodes } from '../marks'
import type { GraphDefinitionOptions } from '../types'
import { geoToWorld, latitudeLimit, worldToGeo } from './geo'
import { createGraphModel } from './graph-model'
import { Positions, placeNodes } from './positions'
import { createScene } from './scene'

interface Place {
  readonly id: string
  readonly lon?: number
  readonly lat?: number
  readonly x?: number
  readonly y?: number
}

describe('Web Mercator', () => {
  it('spans 512 world units from the antimeridian and the northern limit', () => {
    expect(geoToWorld({ longitude: 0, latitude: 0 })).toEqual({ x: 256, y: 256 })
    expect(geoToWorld({ longitude: -180, latitude: latitudeLimit }).x).toBe(0)
    expect(geoToWorld({ longitude: -180, latitude: latitudeLimit }).y).toBeCloseTo(0, 9)
    expect(geoToWorld({ longitude: 180, latitude: -latitudeLimit }).x).toBe(512)
    expect(geoToWorld({ longitude: 180, latitude: -latitudeLimit }).y).toBeCloseTo(512, 9)
  })

  it('clamps the poles to the edges of the world', () => {
    expect(geoToWorld({ longitude: 0, latitude: 90 }).y).toBeCloseTo(0, 9)
    expect(geoToWorld({ longitude: 0, latitude: -90 }).y).toBeCloseTo(512, 9)
  })

  it('turns world points back into degrees', () => {
    const place = { longitude: 2.3522, latitude: 48.8566 }
    const back = worldToGeo(geoToWorld(place))
    expect(back.longitude).toBeCloseTo(place.longitude, 10)
    expect(back.latitude).toBeCloseTo(place.latitude, 10)
    expect(geoToWorld(place).y).toBeLessThan(256)
  })
})

describe('longitude and latitude channels', () => {
  function setup(marks: GraphDefinitionOptions['marks']) {
    const definition = defineGraph({ marks })
    const model = createGraphModel()
    const scene = createScene()
    const positions = new Positions()
    model.setMarks(definition.marks)
    scene.setDefinition(definition)
    const changes = model.flush()
    scene.apply(model, changes)
    placeNodes(model, positions, changes)
    return (key: string) => {
      const index = model.node(key)?.index ?? -1
      return {
        x: positions.x(index),
        y: positions.y(index),
        tracked: positions.source[index * 2],
        screen: scene.nodes.screenUnits[index],
      }
    }
  }

  it('places nodes with Web Mercator, tracks them and sizes them in screen pixels', () => {
    const at = setup([
      nodes<Place>([{ id: 'a', lon: 90, lat: 0 }], { longitude: 'lon', latitude: 'lat' }),
    ])
    expect(at('a')).toEqual({ x: 384, y: 256, tracked: 384, screen: 1 })
  })

  it('keeps world units when asked', () => {
    const at = setup([
      nodes<Place>([{ id: 'a', lon: 0, lat: 0 }], {
        longitude: 'lon',
        latitude: 'lat',
        units: 'world',
      }),
    ])
    expect(at('a').screen).toBe(0)
  })

  it('lets x and y win over longitude and latitude', () => {
    const at = setup([
      nodes<Place>([{ id: 'a', x: 3, y: 4, lon: 90, lat: 0 }], {
        x: 'x',
        y: 'y',
        longitude: 'lon',
        latitude: 'lat',
      }),
    ])
    expect(at('a')).toMatchObject({ x: 3, y: 4, tracked: 3 })
  })

  it('falls back to the spiral without a finite coordinate', () => {
    const at = setup([nodes<Place>([{ id: 'a', lon: 10 }], { longitude: 'lon', latitude: 'lat' })])
    expect(at('a').tracked).toBeNaN()
  })
})
