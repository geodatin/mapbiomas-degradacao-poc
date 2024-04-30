import ee from '@google/earthengine'
import { fireAgeMask, edgeAreaMask, patchSizeMask, isolationMask, secondaryVegetationAgeMask, nativeVegetationMask, getLandUseLandCoverImage } from '../utils/masks.js'
import { getTerritoryFeature, findTerritory, getTerritoryMask } from '../utils/territories.js'
import { GRID_ASSET, findGridIds, splitIntoChunks } from '../utils/grids.js'

const METHOD = 'gridMap'

async function getAreaByClass(req, res) {
  let { territoryId, year } = req.params
  let { 
    fireAge,
    edgeArea, 
    patchSize, 
    isolation, 
    secondaryVegetationAge, 
    nativeVegetationClass,
  } = req.query

  console.log('Request URL:', req.originalUrl)

  fireAge = Number(fireAge)
  secondaryVegetationAge = Number(secondaryVegetationAge)
  nativeVegetationClass = Number(nativeVegetationClass)

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

  const territory = await findTerritory(territoryId)

  if (!territory) {
    return res.status(400).json({ error: 'Territory not found' })
  }

  const territoryFeature = getTerritoryFeature(territory.category, territory.id)

  const territoryMask = getTerritoryMask(territory.category, territory.id)

  image = image.updateMask(territoryMask)

  const lulcImage = getLandUseLandCoverImage(year)
  
  let areas
  if (METHOD === 'normal') {
    console.time('compute area')
    const geometry = territoryFeature.geometry().bounds()
    areas = await computeArea(geometry, image, lulcImage)
    console.timeEnd('compute area')
  } else if (METHOD === 'grid') {
    areas = await computeAreaWithGrid(territoryId, image, lulcImage)
  } else if (METHOD === 'gridMap') {
    areas = await computeAreaWithGridMap(territoryId, image, lulcImage)
  } 

  return res.json({ areas })
}

async function computeAreaWithGrid(territoryId, mask, lulcImage, scale) {
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

      const area = await computeArea(geometry, mask, lulcImage, scale)
      return area
    })
  )
  
  const areasMap = new Map()
  for(const areas of gridAreas) {
    for (const item of areas) {
      if (areasMap.has(item.class)) {
        const sum = areasMap.get(item.class)
        areasMap.set(item.class, sum + item.areaHa)
      } else {
        areasMap.set(item.class, item.areaHa)
      }
    }
  }
  const areas = Array.from(areasMap.entries()).map(([lulcClass, areaHa]) => {
    return {
      'class': lulcClass,
      areaHa 
    }
  })
  console.timeEnd('compute area')

  return areas
}

async function computeArea(geometry, mask, lulcImage) {
  const pixelArea = ee.Image.pixelArea().divide(10000)
  const maskedArea = mask.multiply(pixelArea).rename('area')

  const maskWithClasses = maskedArea.addBands(lulcImage)

  const reducedArea = maskWithClasses.reduceRegion({
    reducer: ee.Reducer.sum().group(1, 'class'),
    geometry: geometry,
    scale: 30,
    maxPixels: 1e13
  })

  const values = ee.List(reducedArea.get('groups')).map((element) => {
    element = ee.Dictionary(element)
    return {
      class: element.get('class'),
      areaHa: element.get('sum')
    }
  })

  const areaHa = await new Promise((resolve, reject) => {
    values.evaluate((areas, error) => {
      if (error) {
        reject(error)
      } else {
        resolve(areas)
      }
    })
  })
  return areaHa
}

async function computeAreaWithGridMap(territoryId, mask, lulcImage) {
  const grid = ee.FeatureCollection(GRID_ASSET)

  console.time('find grid ids')
  const gridIds = await findGridIds(territoryId)
  console.timeEnd('find grid ids')

  const CHUNK_SIZE = 10
  const gridIdChunks = splitIntoChunks(gridIds, CHUNK_SIZE)

  console.time('compute area')
  const gridAreas = await Promise.all(
    gridIdChunks.map((ids) => {
      const grids = grid.filter(ee.Filter.inList('id', ee.List(ids)))
      return computeAreaMap(grids, mask, lulcImage)
    })
  )

  const areasMap = new Map()
  for(const areas of gridAreas) {
    for(const chunkAreas of areas) {
      for (const item of chunkAreas) {
        if (areasMap.has(item.class)) {
          const sum = areasMap.get(item.class)
          areasMap.set(item.class, sum + item.sum)
        } else {
          areasMap.set(item.class, item.sum)
        }
      }
    }
  }

  const totalAreas = Array.from(areasMap.entries()).map(([lulcClass, areaHa]) => {
    return {
      'class': lulcClass,
      areaHa 
    }
  })
  console.timeEnd('compute area')
  
  return totalAreas
}

function computeAreaMap(collection, mask, lulcImage) {
  const pixelArea = ee.Image.pixelArea().divide(10000)
  const maskedArea = mask.multiply(pixelArea).rename('area')

  const maskWithClasses = maskedArea.addBands(lulcImage)

  const areas = collection.map((feature) => {
    const area = maskWithClasses.reduceRegion({
      reducer: ee.Reducer.sum().group(1, 'class'),
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
        const areas = featureAreas.features.map((f) => f.properties.groups)
        resolve(areas)
      }
    })
  })
}

export { getAreaByClass }