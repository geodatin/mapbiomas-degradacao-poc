import ee from '@google/earthengine'
import database from '../../infra/database.js'

const GRID_ASSET = 'projects/mapbiomas-agua/assets/gridBrazil'

async function computeStatistics(req, res) {
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

  const geometry = territoryFeature.geometry()

  let areaHa
  if (method === 'normal') {
    console.time('compute area')
    areaHa = await computeArea(geometry.bounds(), image, scale)
    console.timeEnd('compute area')
  } else if (method === 'grid') {
    areaHa = await computeAreaWithGrid(territoryType, territoryCode, image, scale)
  } else if (method === 'gridMap') {
    areaHa = await computeAreaWithGridMap(territoryType, territoryCode, image, scale, chunksize)
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

async function findGridIds(territoryType, territoryCode) {
  const result = await database.query({
    text: "SELECT grid_id FROM territories_grids WHERE territory_type = $1 AND territory_code = $2;",
    values: [territoryType, territoryCode],
  })
  const gridIds = result.rows.map((grid) => grid.grid_id)
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

function splitIntoChunks(array, chunksize) {
  const arrays = []

  for (let i = 0; i < array.length; i += chunksize) {
    arrays.push(array.slice(i, i + chunksize))
  }

  return arrays
}

export { computeStatistics }