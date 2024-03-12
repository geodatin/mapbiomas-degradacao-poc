import ee from '@google/earthengine'

import { fireAgeMask, edgeAreaMask, patchSizeMask, isolationMask, secondaryVegetationAgeMask, nativeVegetationMask, landUseLandCoverMask } from '../utils/masks.js'
import { filterTerritory, fetchTerritoryCode, territoryMask } from '../utils/territories.js'
import { GRID_ASSET, findGridIds, splitIntoChunks } from '../utils/grids.js'

async function getArea(req, res) {
  let { method, territoryType, territoryName, year } = req.params
  let {
    escala: scale, 
    numeroDeGrids: chunksize, 
    fogoIdade: fireAge,
    areaBorda: edgeArea, 
    tamanhoFragmento: patchSize, 
    isolamento: isolation, 
    vegetacaoSecundariaIdade: secondaryVegetationAge, 
    vegetacaoNativaClasse: nativeVegetationClass,
    usoECoberturaClasse: landUseLandCoverClass
  } = req.query

  console.log('Request URL:', req.originalUrl)

  scale = Number(scale) || 30
  chunksize = Number(chunksize) || 5
  fireAge = Number(fireAge)
  secondaryVegetationAge = Number(secondaryVegetationAge)
  nativeVegetationClass = Number(nativeVegetationClass)
  landUseLandCoverClass = Number(landUseLandCoverClass)

  let image = ee.Image(1)

  if (fireAge) {
    const mask = fireAgeMask(year, fireAge)
    image = image.updateMask(mask)
  }

  if (edgeArea) {
    const mask = edgeAreaMask(year, edgeArea)
    image = image.updateMask(mask)
  }

  if (patchSize) {
    const mask = patchSizeMask(year, patchSize)
    image = image.updateMask(mask)
  }

  if (isolation) {
    const mask = isolationMask(year, isolation)
    image = image.updateMask(mask)
  }

  if (secondaryVegetationAge) {
    const mask = secondaryVegetationAgeMask(year, secondaryVegetationAge)
    image = image.updateMask(mask)
  }

  if (nativeVegetationClass) {
    const mask = nativeVegetationMask(year, nativeVegetationClass)
    image = image.updateMask(mask)
  }

  if (landUseLandCoverClass) {
    const mask = landUseLandCoverMask(year, landUseLandCoverClass)
    image = image.updateMask(mask)
  }

  const territoryFeature = filterTerritory(territoryType, territoryName)

  if (!territoryFeature) {
    return res.status(400).json({ error: 'Territory not found' })
  }

  const territoryCode = await fetchTerritoryCode(territoryFeature)
  const mask = territoryMask(territoryType, territoryCode)

  image = image.updateMask(mask)

  
  let areaHa
  if (method === 'normal') {
    console.time('compute area')
    const geometry = territoryFeature.geometry().bounds()
    areaHa = await computeArea(geometry, image, scale)
    console.timeEnd('compute area')
  } else if (method === 'grid') {
    areaHa = await computeAreaWithGrid(territoryType, territoryCode, image, scale)
  } else if (method === 'gridMap') {
    areaHa = await computeAreaWithGridMap(territoryType, territoryCode, image, scale, chunksize)
  } 

  return res.json({ areaHa })
}

async function computeAreaWithGrid(territoryType, territoryCode, mask, scale) {
  console.time('find grid ids')
  const gridIds = await findGridIds(territoryType, territoryCode)
  console.timeEnd('find grid ids')

  const grid = ee.FeatureCollection(GRID_ASSET)

  console.time('compute area')
  const gridAreas = await Promise.all(
    gridIds.map(async (id) => {
      const geometry = ee.Feature(
        grid.filter(ee.Filter.eq('id', id)).first()
      ).geometry()

      const area = await computeArea(geometry, mask, scale)
      return area
    })
  )
  const sumArea = gridAreas.reduce((sum, area) => sum + area, 0)
  console.timeEnd('compute area')

  return sumArea
}

async function computeArea(geometry, mask, scale) {
  const pixelArea = ee.Image.pixelArea().divide(10000)
  const maskedArea = mask.multiply(pixelArea).rename('area')

  const reducedArea = maskedArea.reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: geometry,
    scale: scale,
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

async function computeAreaWithGridMap(territoryType, territoryCode, mask, scale, chunksize) {
  const grid = ee.FeatureCollection(GRID_ASSET)

  console.time('find grid ids')
  const gridIds = await findGridIds(territoryType, territoryCode)
  console.timeEnd('find grid ids')

  const gridIdChunks = splitIntoChunks(gridIds, chunksize)

  console.time('compute area')
  const areas = await Promise.all(
    gridIdChunks.map(async (ids) => {
      const grids = grid.filter(ee.Filter.inList('id', ee.List(ids)))
      const gridAreas = await computeAreaMap(grids, mask, scale)
      return gridAreas
    })
  )
  const totalArea = areas.reduce((sum, area) => sum + area, 0)
  console.timeEnd('compute area')
  
  return totalArea
}

function computeAreaMap(collection, mask, scale) {
  const pixelArea = ee.Image.pixelArea().divide(10000)
  const maskedArea = mask.multiply(pixelArea).rename('area')

  const areas = collection.map((feature) => {
    const area = maskedArea.reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: feature.geometry(),
      scale: scale,
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