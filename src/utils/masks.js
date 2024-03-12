import ee from '@google/earthengine'

const LAND_USE_LAND_COVER_ASSET = 'projects/mapbiomas-workspace/public/collection8/mapbiomas_collection80_integration_v1'

export function fireAgeMask(year, age) {
  const fireAgeImg = ee.Image('projects/mapbiomas-workspace/DEGRADACAO/COLECAO/BETA/PROCESS/fire/age_v1')
    .select(`age_${year}`)
    .divide(100)
    .toInt()

  const mask = fireAgeImg.lte(age).selfMask()
  return mask
}

export function edgeAreaMask(year, edgeArea) {
  const edgeAreaImg = ee.Image(`projects/mapbiomas-workspace/DEGRADACAO/COLECAO/BETA/PROCESS/edge_area/edge_${edgeArea}m_v2`)
    .select(`edge_${edgeArea}m_${year}`)
  const mask = edgeAreaImg
  return mask
}

export function patchSizeMask(year, patchSize) {
  const patchSizeImage = ee.Image(`projects/mapbiomas-workspace/DEGRADACAO/COLECAO/BETA/PROCESS/patch_size/size_${patchSize}ha_v3`)
    .select(`size_${patchSize}ha_${year}`)
  const mask = patchSizeImage.gte(1).selfMask()
  return mask
}

export function isolationMask(year, isolation) {
  const [med, dist, gde] = isolation.split(',')
  const [, medValue] = med.split(':')
  const [, distValue] = dist.split(':')
  const [, gdeValue] = gde.split(':')

  const isolationImage = ee.Image(`projects/mapbiomas-workspace/DEGRADACAO/ISOLATION/nat_uso_frag${medValue.trim()}__dist${distValue.trim()}k__${gdeValue.trim()}_v6_85_22`)
    .select(`nat_${year}`)

  const mask = isolationImage.gte(1).selfMask()
  return mask
}

export function secondaryVegetationAgeMask(year, age) {
  const secondaryVegetationAgeImage = ee.Image('projects/mapbiomas-workspace/DEGRADACAO/COLECAO/BETA/PROCESS/secondary_vegetation/secondary_vegetation_age_v1')
    .select(`age_${year}`)
    .divide(100)
    .toInt()

  const mask = secondaryVegetationAgeImage.lte(age).selfMask()
  return mask
}

export function nativeVegetationMask(year, nativeVegetationClass) {
  const nativeVegetationImage = ee.Image('projects/mapbiomas-workspace/DEGRADACAO/COLECAO/BETA/PROCESS/reference_native/reference_v1')
    .select(`classification_${year}`)
  const mask = nativeVegetationImage.eq(nativeVegetationClass).selfMask()
  return mask
}

export function selectLandUseLandCoverImage(year) {
  const lulcImage = ee.Image(LAND_USE_LAND_COVER_ASSET)
                      .select(`classification_${year}`)
                      .rename(['class'])
  return lulcImage
}

export function landUseLandCoverMask(year, landUseLandCoverClass) {
  const lulcImage = ee.Image(LAND_USE_LAND_COVER_ASSET)
                      .select(`classification_${year}`)
  
  const mask = lulcImage.eq(landUseLandCoverClass).selfMask()
  return mask
}