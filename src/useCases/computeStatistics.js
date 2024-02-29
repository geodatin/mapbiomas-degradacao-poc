import ee from '@google/earthengine'

const GRID_ASSET = 'projects/mapbiomas-agua/assets/gridBrazil'

async function computeStatistics(req, res) {
  let { method, territoryType, territoryName, year } = req.params
  let { escala, fogoIdade, areaBorda, tamanhoFragmento, isolamento, vegetacaoSecundariaIdade, vegetacaoNativaClasse } = req.query

  console.log('Request URL:', req.originalUrl)

  escala = Number(escala) || 30
  fogoIdade = Number(fogoIdade)
  vegetacaoSecundariaIdade = Number(vegetacaoSecundariaIdade)
  vegetacaoNativaClasse = Number(vegetacaoNativaClasse)

  let image = ee.Image(1)

  if (fogoIdade) {
    const mask = fireAgeMask(year, fogoIdade)
    image = image.updateMask(mask)
  }

  if (areaBorda) {
    const mask = edgeAreaMask(year, areaBorda)
    image = image.updateMask(mask)
  }

  if (tamanhoFragmento) {
    const mask = patchSizeMask(year, tamanhoFragmento)
    image = image.updateMask(mask)
  }

  if (isolamento) {
    const mask = isolationMask(year, isolamento)
    image = image.updateMask(mask)
  }

  if (vegetacaoSecundariaIdade) {
    const mask = secondaryVegetationAgeMask(year, vegetacaoSecundariaIdade)
    image = image.updateMask(mask)
  }

  if (vegetacaoNativaClasse) {
    const mask = nativeVegetationMask(year, vegetacaoNativaClasse)
    image = image.updateMask(mask)
  }

  const territoryFeature = filterTerritory(territoryType, territoryName)

  if (!territoryFeature) {
    return res.status(400).json({ error: 'Territory not found' })
  }

  const territoryCode = await fetchTerritoryCode(territoryFeature)
  const mask = territoryMask(territoryType, territoryCode)

  image = image.updateMask(mask)

  const geometry = territoryFeature.geometry()

  let areaHa
  if (method === 'normal') {
    console.time('compute area')
    areaHa = await computeArea(geometry.bounds(), image, escala)
    console.timeEnd('compute area')
  } else if (method === 'grid') {
    areaHa = await computeAreaWithGrid(geometry, image, escala)
  } else if (method === 'gridMap') {
    areaHa = await computeAreaWithGridMap(geometry, image, escala)
  } 

  return res.json({ areaHa })
}

function fireAgeMask(year, age) {
  const fireAgeImg = ee.Image('projects/mapbiomas-workspace/DEGRADACAO/COLECAO/BETA/PROCESS/fire/age_v1')
    .select(`age_${year}`)
    .divide(100)
    .toInt()

  const mask = fireAgeImg.lte(age).selfMask()
  return mask
}

function edgeAreaMask(year, edgeArea) {
  const edgeAreaImg = ee.Image(`projects/mapbiomas-workspace/DEGRADACAO/COLECAO/BETA/PROCESS/edge_area/edge_${edgeArea}m_v2`)
    .select(`edge_${edgeArea}m_${year}`)
  const mask = edgeAreaImg
  return mask
}

function patchSizeMask(year, patchSize) {
  const patchSizeImage = ee.Image(`projects/mapbiomas-workspace/DEGRADACAO/COLECAO/BETA/PROCESS/patch_size/size_${patchSize}ha_v3`)
    .select(`size_${patchSize}ha_${year}`)
  const mask = patchSizeImage.gte(1).selfMask()
  return mask
}

function isolationMask(year, isolation) {
  const [med, dist, gde] = isolation.split(',')
  const [, medValue] = med.split(':')
  const [, distValue] = dist.split(':')
  const [, gdeValue] = gde.split(':')

  const isolationImage = ee.Image(`projects/mapbiomas-workspace/DEGRADACAO/ISOLATION/nat_uso_frag${medValue.trim()}__dist${distValue.trim()}k__${gdeValue.trim()}_v6_85_22`)
    .select(`nat_${year}`)

  const mask = isolationImage.gte(1).selfMask()
  return mask
}

function secondaryVegetationAgeMask(year, age) {
  const secondaryVegetationAgeImage = ee.Image('projects/mapbiomas-workspace/DEGRADACAO/COLECAO/BETA/PROCESS/secondary_vegetation/secondary_vegetation_age_v1')
    .select(`age_${year}`)
    .divide(100)
    .toInt()

  const mask = secondaryVegetationAgeImage.lte(age).selfMask()
  return mask
}

function nativeVegetationMask(year, nativeVegetationClass) {
  const nativeVegetationImage = ee.Image('projects/mapbiomas-workspace/DEGRADACAO/COLECAO/BETA/PROCESS/reference_native/reference_v1')
    .select(`classification_${year}`)
  const mask = nativeVegetationImage.eq(nativeVegetationClass).selfMask()
  return mask
}

function filterTerritory(territoryType, territoryName) {
  if (territoryType === 'bioma') {
    const feature = ee.Feature(
      ee.FeatureCollection('projects/mapbiomas-agua/assets/territories/biome')
        .filter(ee.Filter.eq('Bioma', territoryName))
        .first()
    )
    return feature.select(['CD_Bioma', 'Bioma'], ['code', 'name'])
  }

  if (territoryType === 'municipio') {
    const split = territoryName.split('-')
    const cityName = split[0].trim()
    const cityUf = split[1].trim()
    const feature = ee.Feature(
      ee.FeatureCollection('projects/mapbiomas-agua/assets/territories/city')
        .filter(ee.Filter.eq('NM_MUN', cityName))
        .filter(ee.Filter.eq('SIGLA_UF', cityUf))
        .first()
    )
    return feature.select(['CODIBGE', 'NM_MUN', 'SIGLA_UF'], ['code', 'name', 'uf'])
  }

  if (territoryType === 'estado') {
    const feature = ee.Feature(
      ee.FeatureCollection('projects/mapbiomas-agua/assets/territories/state')
        .filter(ee.Filter.eq('NM_UF', territoryName))
        .first()
    )
    return feature.select(['CD_UF', 'NM_UF', 'SIGLA_UF'], ['code', 'name', 'uf'])
  }
}

async function fetchTerritoryCode(territoryFeature) {
  return new Promise((resolve, reject) => {
    territoryFeature.get('code').evaluate((code, error) => {
      if (error) {
        reject(error)
      } else {
        resolve(code)
      }
    })
  })
}

function territoryMask(territoryType, territoryCode) {
  const assetId = {
    'bioma': 'projects/mapbiomas-agua/assets/territories/images/biome',
    'municipio': 'projects/mapbiomas-agua/assets/territories/images/city',
    'estado': 'projects/mapbiomas-agua/assets/territories/images/state'
  }
  const mask = ee.Image(assetId[territoryType])
    .eq(territoryCode)
    .selfMask()
  return mask
}

async function computeAreaWithGrid(geometry, mask, scale) {
  const grid = ee.FeatureCollection(GRID_ASSET)
    .filterBounds(geometry)

  console.time('fetch grid ids')
  const gridIds = await fetchGridIds(grid)
  console.timeEnd('fetch grid ids')

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

async function fetchGridIds(grid) {
  const gridIds = await new Promise((resolve, reject) => {
    grid.aggregate_array('id').evaluate((ids, error) => {
      if (error) {
        reject(error)
      } else {
        resolve(ids)
      }
    })
  })
  return gridIds
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

async function computeAreaWithGridMap(geometry, mask, scale) {
  const grid = ee.FeatureCollection(GRID_ASSET)
  
  const gridsIntersectGeometry = grid.filterBounds(geometry)

  console.time('fetch grid ids')
  const gridIds = await fetchGridIds(gridsIntersectGeometry)
  console.timeEnd('fetch grid ids')

  const gridIdChunks = splitIntoChunks(gridIds, 5)

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

function splitIntoChunks(array, chunksize) {
  const arrays = []

  for (let i = 0; i < array.length; i += chunksize) {
    arrays.push(array.slice(i, i + chunksize))
  }

  return arrays
}

export { computeStatistics }