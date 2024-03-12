import ee from '@google/earthengine'

export function filterTerritory(territoryType, territoryName) {
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

export async function fetchTerritoryCode(territoryFeature) {
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

export function territoryMask(territoryType, territoryCode) {
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