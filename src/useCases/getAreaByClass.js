import ee from '@google/earthengine'
import { fireAgeMask, edgeAreaMask, patchSizeMask, isolationMask, secondaryVegetationAgeMask, nativeVegetationMask } from '../utils/masks.js'
import { filterTerritory, fetchTerritoryCode, territoryMask } from '../utils/territories.js'
import { GRID_ASSET, findGridIds, splitIntoChunks } from '../utils/grids.js'

const LAND_USE_LAND_COVER_ASSET = 'projects/mapbiomas-workspace/public/collection8/mapbiomas_collection80_integration_v1'

async function getAreaByClass(req, res) {
  let { method, territoryType, territoryName, year } = req.params
  let {
    escala: scale, 
    numeroDeGrids: chunksize, 
    fogoIdade: fireAge,
    areaBorda: edgeArea, 
    tamanhoFragmento: patchSize, 
    isolamento: isolation, 
    vegetacaoSecundariaIdade: secondaryVegetationAge, 
    vegetacaoNativaClasse: nativeVegetationClass
  } = req.query

  console.log('Request URL:', req.originalUrl)

  scale = Number(scale) || 30
  chunksize = Number(chunksize) || 5
  fireAge = Number(fireAge)
  secondaryVegetationAge = Number(secondaryVegetationAge)
  nativeVegetationClass = Number(nativeVegetationClass)

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

  const territoryFeature = filterTerritory(territoryType, territoryName)

  if (!territoryFeature) {
    return res.status(400).json({ error: 'Territory not found' })
  }

  const territoryCode = await fetchTerritoryCode(territoryFeature)
  const mask = territoryMask(territoryType, territoryCode)

  image = image.updateMask(mask)

  const lulcImage = selectLandUseLandCoverImage(year)
  
  let areas
  if (method === 'normal') {
    console.time('compute area')
    const geometry = territoryFeature.geometry().bounds()
    areas = await computeArea(geometry, image, lulcImage, scale)
    console.timeEnd('compute area')
  } else if (method === 'grid') {
    areas = await computeAreaWithGrid(territoryType, territoryCode, image, lulcImage, scale)
  } else if (method === 'gridMap') {
    areas = await computeAreaWithGridMap(territoryType, territoryCode, image, lulcImage, scale, chunksize)
  } 

  return res.json({ areas })
}

function selectLandUseLandCoverImage(year) {
  const lulcImage = ee.Image(LAND_USE_LAND_COVER_ASSET)
                      .select(`classification_${year}`)
                      .rename(['class'])
  return lulcImage
}

async function computeAreaWithGrid(territoryType, territoryCode, mask, lulcImage, scale) {
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

async function computeArea(geometry, mask, lulcImage, scale) {
  const pixelArea = ee.Image.pixelArea().divide(10000)
  const maskedArea = mask.multiply(pixelArea).rename('area')

  const maskWithClasses = maskedArea.addBands(lulcImage)

  const reducedArea = maskWithClasses.reduceRegion({
    reducer: ee.Reducer.sum().group(1, 'class'),
    geometry: geometry,
    scale: scale,
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

async function computeAreaWithGridMap(territoryType, territoryCode, mask, lulcImage, scale, chunksize) {
  const grid = ee.FeatureCollection(GRID_ASSET)

  console.time('find grid ids')
  const gridIds = await findGridIds(territoryType, territoryCode)
  console.timeEnd('find grid ids')

  const gridIdChunks = splitIntoChunks(gridIds, chunksize)

  console.time('compute area')
  const gridAreas = await Promise.all(
    gridIdChunks.map((ids) => {
      const grids = grid.filter(ee.Filter.inList('id', ee.List(ids)))
      return computeAreaMap(grids, mask, lulcImage, scale)
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

function computeAreaMap(collection, mask, lulcImage, scale) {
  const pixelArea = ee.Image.pixelArea().divide(10000)
  const maskedArea = mask.multiply(pixelArea).rename('area')

  const maskWithClasses = maskedArea.addBands(lulcImage)

  const areas = collection.map((feature) => {
    const area = maskWithClasses.reduceRegion({
      reducer: ee.Reducer.sum().group(1, 'class'),
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
        const areas = featureAreas.features.map((f) => f.properties.groups)
        resolve(areas)
      }
    })
  })
}

export { getAreaByClass }