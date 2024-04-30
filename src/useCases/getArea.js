import ee from '@google/earthengine'

import { fireAgeMask, edgeAreaMask, patchSizeMask, isolationMask, secondaryVegetationAgeMask, nativeVegetationMask, landUseLandCoverMask } from '../utils/masks.js'
import { getTerritoryFeature, getTerritoryMask, findTerritory } from '../utils/territories.js'
import { GRID_ASSET, findGridIds, splitIntoChunks } from '../utils/grids.js'

const METHOD = 'gridMap' 

async function getArea(req, res) {
  let { territoryId, year } = req.params
  let {
    fireAge,
    edgeArea, 
    patchSize, 
    isolation, 
    secondaryVegetationAge, 
    nativeVegetationClass,
    landUseLandCoverClass
  } = req.query

  console.log('Request URL:', req.originalUrl)

  fireAge = Number(fireAge)
  secondaryVegetationAge = Number(secondaryVegetationAge)
  nativeVegetationClass = Number(nativeVegetationClass)
  landUseLandCoverClass = Number(landUseLandCoverClass)

  let image = ee.Image(0)

  if (fireAge) {
    const mask = fireAgeMask(fireAge, year)
    image = image.or(mask)
  }

  if (edgeArea) {
    const mask = edgeAreaMask(edgeArea, year)
    image = image.or(mask)
  }

  if (patchSize) {
    const mask = patchSizeMask(patchSize, year)
    image = image.or(mask)
  }

  if (isolation) {
    const mask = isolationMask(isolation, year)
    image = image.or(mask)
  }

  if (secondaryVegetationAge) {
    const mask = secondaryVegetationAgeMask(secondaryVegetationAge, year)
    image = image.or(mask)
  }

  if (nativeVegetationClass) {
    const mask = nativeVegetationMask(nativeVegetationClass, year)
    image = image.or(mask)
  }

  if (landUseLandCoverClass) {
    const mask = landUseLandCoverMask(landUseLandCoverClass, year)
    image = image.or(mask)
  }

  const territory = await findTerritory(territoryId)

  if (!territory) {
    return res.status(400).json({ error: 'Territory not found' })
  }

  const territoryFeature = getTerritoryFeature(territory.category, territory.id)

  const territoryMask = getTerritoryMask(territory.category, territory.id)

  image = image.updateMask(territoryMask)

  let areaHa
  if (METHOD === 'normal') {
    console.time('compute area')
    const geometry = territoryFeature.geometry().bounds()
    areaHa = await computeArea(geometry, image)
    console.timeEnd('compute area')
  } else if (METHOD === 'grid') {
    areaHa = await computeAreaWithGrid(territoryId, image)
  } else if (METHOD === 'gridMap') {
    areaHa = await computeAreaWithGridMap(territoryId, image)
  } 

  return res.json({ areaHa })
}

async function computeAreaWithGrid(territoryId, mask) {
  console.time('find grid ids')
  const gridIds = await findGridIds(territoryId)
  console.timeEnd('find grid ids')

  const grid = ee.FeatureCollection(GRID_ASSET)

  console.time('compute area')
  const gridAreas = await Promise.all(
    gridIds.map(async (id) => {
      const geometry = ee.Feature(
        grid.filter(ee.Filter.eq('id', id)).first()
      ).geometry()

      const area = await computeArea(geometry, mask)
      return area
    })
  )
  const sumArea = gridAreas.reduce((sum, area) => sum + area, 0)
  console.timeEnd('compute area')

  return sumArea
}

async function computeArea(geometry, mask) {
  const pixelArea = ee.Image.pixelArea().divide(10000)
  const maskedArea = mask.multiply(pixelArea).rename('area')

  const reducedArea = maskedArea.reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: geometry,
    scale: 30,
    maxPixels: 1e13
  })

  const areaHa = await new Promise((resolve, reject) => {
    reducedArea.get('area').evaluate((area, error) => {
      if (error) {
        reject(error)
      } else {
        resolve(area)
      }
    })
  })
  return areaHa
}

async function computeAreaWithGridMap(territoryId, mask) {
  const grid = ee.FeatureCollection(GRID_ASSET)

  console.time('find grid ids')
  const gridIds = await findGridIds(territoryId)
  console.timeEnd('find grid ids')

  const CHUNK_SIZE = 10
  const gridIdChunks = splitIntoChunks(gridIds, CHUNK_SIZE)

  console.log(`Grid id chunks: ${gridIdChunks.length}`)

  console.time('compute area')
  const areas = await Promise.all(
    gridIdChunks.map(async (ids) => {
      const grids = grid.filter(ee.Filter.inList('id', ee.List(ids)))
      const gridAreas = await computeAreaMap(grids, mask)
      return gridAreas
    })
  )
  const totalArea = areas.reduce((sum, area) => sum + area, 0)
  console.timeEnd('compute area')
  
  return totalArea
}

function computeAreaMap(collection, mask) {
  const pixelArea = ee.Image.pixelArea().divide(10000)
  const maskedArea = mask.multiply(pixelArea).rename('area')

  const areas = collection.map((feature) => {
    const area = maskedArea.reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: feature.geometry(),
      scale: 30,
      maxPixels: 1e13
    })

    return ee.Feature(null, area)
  })

  return new Promise((resolve, reject) => {
    areas.evaluate((featureAreas, error) => {
      if (error) {
        reject(error)
      } else {
        const areas = featureAreas.features.map((f) => f.properties.area)
        const sum = areas.reduce((sum, area) => sum + area)
        resolve(sum)
      }
    })
  })
}

export { getArea }