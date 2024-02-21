import 'express-async-errors'
import express from 'express'
import ee from '@google/earthengine'
import swaggerUi from 'swagger-ui-express'
import swaggerFile from '../swagger.json' assert { type: "json" };

const app = express()

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use(
  '/',
  swaggerUi.serve,
  swaggerUi.setup(swaggerFile, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Mapbiomas Degradação',
  }),
)

app.get('/api/v1/statistics/:biomeName/:year', async (req, res) => {
  let { biomeName, year } = req.params
  let { escala, fogoIdade, areaBorda, tamanhoFragmento, isolamento, vegetacaoSecundariaIdade, vegetacaoNativa } = req.query
  
  escala = Number(escala) || 30
  fogoIdade = Number(fogoIdade)
  vegetacaoSecundariaIdade = Number(vegetacaoSecundariaIdade)

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

  if(vegetacaoNativa === 'true') {
    const mask = nativeVegetationMask(year)
    image = image.updateMask(mask)
  }

  const biome = filterBiome(biomeName)

  const biomeCode = biome.get('CD_Bioma').getInfo()
  const territoryMask = biomeMask(biomeCode)

  image = image.updateMask(territoryMask)

  const geometry = biome.geometry().bounds()
  const areaHa = await computeArea(geometry, image, escala)

  return res.json({ areaHa })
})

function fireAgeMask(year, age) {
  const fireAgeImg = ee.Image('projects/mapbiomas-workspace/DEGRADACAO/COLECAO/BETA/PROCESS/fire/age_v1')
              .select(`age_${year}`)
              .divide(100)
              .toInt()

  const mask = fireAgeImg.eq(age).selfMask()
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

  const mask = secondaryVegetationAgeImage.eq(age).selfMask()
  return mask
}

function nativeVegetationMask(year) {
  const nativeVegetationImage = ee.Image('projects/mapbiomas-workspace/DEGRADACAO/COLECAO/BETA/PROCESS/reference_native/reference_v1')
                                  .select(`classification_${year}`)
  const mask = nativeVegetationImage.gte(1).selfMask()
  return mask
}

function filterBiome(biomeName) {
  return ee.FeatureCollection('projects/mapbiomas-agua/assets/territories/biome')
    .filter(ee.Filter.eq('Bioma', biomeName))
    .first()
}

function biomeMask(biomeCode) {
  const mask = ee.Image('projects/mapbiomas-agua/assets/territories/images/biome')
                 .eq(biomeCode)
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