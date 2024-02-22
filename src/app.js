import 'express-async-errors'
import express from 'express'
import ee from '@google/earthengine'
import swaggerUi from 'swagger-ui-express'
import swaggerFile from '../swagger.json' assert { type: "json" };

const app = express()

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use(
  '/api/docs',
  swaggerUi.serve,
  swaggerUi.setup(swaggerFile, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Mapbiomas Degradação',
  }),
)

app.get('/api/v1/territories', async (req, res) => {
  const [biomes, cities, states] = await Promise.all([
    fetchBiomes(),
    fetchCities(),
    fetchStates()
  ])

  const territories = [...biomes, ...cities, ...states]

  return res.json({ territories })
})

async function fetchBiomes() {
  const features = ee.FeatureCollection('projects/mapbiomas-agua/assets/territories/biome')
  const columns = await new Promise((resolve, reject) => {
    features.reduceColumns(ee.Reducer.toList(2), ['CD_Bioma', 'Bioma']).get('list').evaluate((list, error) => {
      if(error) {
        reject(error)
      } else {
        resolve(list)
      }
    })
  })

  const biomes = columns.map((props) => {
    return {
      tipo: 'bioma',
      codigo: props[0],
      nome: props[1]
    }
  })
  return biomes
}

async function fetchCities() {
  const features = ee.FeatureCollection('projects/mapbiomas-agua/assets/territories/city')
  const columns = await new Promise((resolve, reject) => {
    features.reduceColumns(ee.Reducer.toList(3), ['CODIBGE', 'NM_MUN', 'SIGLA_UF']).get('list').evaluate((list, error) => {
      if(error) {
        reject(error)
      } else {
        resolve(list)
      }
    })
  })

  const cities = columns.map((props) => {
    return {
      tipo: 'municipio',
      codigo: props[0],
      nome: `${props[1]}-${props[2]}`
    }
  })
  return cities
}

async function fetchStates() {
  const features = ee.FeatureCollection('projects/mapbiomas-agua/assets/territories/state')
  const columns = await new Promise((resolve, reject) => {
    features.reduceColumns(ee.Reducer.toList(2), ['CD_UF', 'NM_UF']).get('list').evaluate((list, error) => {
      if(error) {
        reject(error)
      } else {
        resolve(list)
      }
    })
  })

  const cities = columns.map((props) => {
    return {
      tipo: 'estado',
      codigo: props[0],
      nome: props[1]
    }
  })
  return cities
}

app.get('/api/v1/statistics/:territoryType/:territoryName/:year', async (req, res) => {
  let { territoryType, territoryName, year } = req.params
  let { escala, fogoIdade, areaBorda, tamanhoFragmento, isolamento, vegetacaoSecundariaIdade, vegetacaoNativaClasse } = req.query
  
  escala = Number(escala) || 30
  fogoIdade = Number(fogoIdade)
  vegetacaoSecundariaIdade = Number(vegetacaoSecundariaIdade)
  vegetacaoNativaClasse = Number(vegetacaoNativaClasse)

  let image = ee.Image(1)

  if(fogoIdade) {
    const mask = fireAgeMask(year, fogoIdade)
    image = image.updateMask(mask)
  }

  if(areaBorda) {
    const mask = edgeAreaMask(year, areaBorda)
    image = image.updateMask(mask)
  }

  if(tamanhoFragmento) {
    const mask = patchSizeMask(year, tamanhoFragmento)
    image = image.updateMask(mask)
  }

  if(isolamento) {
    const mask = isolationMask(year, isolamento)
    image = image.updateMask(mask)
  }

  if(vegetacaoSecundariaIdade) {
    const mask = secondaryVegetationAgeMask(year, vegetacaoSecundariaIdade)
    image = image.updateMask(mask)
  }

  if(vegetacaoNativaClasse) {
    const mask = nativeVegetationMask(year, vegetacaoNativaClasse)
    image = image.updateMask(mask)
  }

  const territoryFeature = filterTerritory(territoryType, territoryName)
  
  const territoryCode = await fetchTerritoryCode(territoryFeature)
  const mask = territoryMask(territoryType, territoryCode)

  image = image.updateMask(mask)

  const geometry = territoryFeature.geometry().bounds()
  const areaHa = await computeArea(geometry, image, escala)

  return res.json({ areaHa })
})

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

  throw Error('Territory not found.')
}

async function fetchTerritoryCode(territoryFeature) {
  return new Promise((resolve, reject) => {
    territoryFeature.get('code').evaluate((code, error) => {
      if(error) {
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
      if(error) {
        reject(error)
      } else {      
        resolve(area)
      }
    })
  })
  return areaHa
}

export { app }