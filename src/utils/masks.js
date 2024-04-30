import ee from '@google/earthengine'

const LAND_USE_LAND_COVER_ASSET = 'projects/mapbiomas-workspace/public/collection8/mapbiomas_collection80_integration_v1'

export function fireAgeMask(age, year) {
  let fireAgeImg = ee.Image(0).rename(['age_1985'])

  fireAgeImg = fireAgeImg.addBands(
    ee.Image('projects/mapbiomas-workspace/DEGRADACAO/COLECAO/BETA/PROCESS/fire/age_v1')
  )

  if (year) {
    fireAgeImg = fireAgeImg.select(`age_${year}`)
  }

  const mask = fireAgeImg.divide(100).toInt().lte(age).selfMask()

  return renameBandsToYear(mask)
}

export function edgeAreaMask(edgeArea, year) {
  let edgeAreaImg = ee.Image(`projects/mapbiomas-workspace/DEGRADACAO/COLECAO/BETA/PROCESS/edge_area/edge_${edgeArea}m_v2`)

  if (year) {
    edgeAreaImg = edgeAreaImg.select(`edge_${edgeArea}m_${year}`)
  }

  const mask = edgeAreaImg.gt(0).selfMask()

  return renameBandsToYear(mask)
}

export function patchSizeMask(patchSize, year) {
  let patchSizeImage = ee.Image(`projects/mapbiomas-workspace/DEGRADACAO/COLECAO/BETA/PROCESS/patch_size/size_${patchSize}ha_v3`)

  if (year) {
    patchSizeImage = patchSizeImage.select(`size_${patchSize}ha_${year}`)
  }

  const mask = patchSizeImage.gt(0).selfMask()

  return renameBandsToYear(mask)
}

export function isolationMask(isolation, year) {
  const [med, dist, gde] = isolation.split(',')
  const [, medValue] = med.split(':')
  const [, distValue] = dist.split(':')
  const [, gdeValue] = gde.split(':')

  let isolationImage = ee.Image(`projects/mapbiomas-workspace/DEGRADACAO/ISOLATION/nat_uso_frag${medValue.trim()}__dist${distValue.trim()}k__${gdeValue.trim()}_v6_85_22`)

  if (year) {
    isolationImage = isolationImage.select(`nat_${year}`)
  }

  const mask = isolationImage.gt(0).selfMask()

  return renameBandsToYear(mask)
}

export function secondaryVegetationAgeMask(age, year) {
  let secondaryVegetationAgeImage = ee.Image('projects/mapbiomas-workspace/DEGRADACAO/COLECAO/BETA/PROCESS/secondary_vegetation/secondary_vegetation_age_v1')
  
  if (year) {
    secondaryVegetationAgeImage = secondaryVegetationAgeImage.select(`age_${year}`)
  }

  const mask = secondaryVegetationAgeImage.divide(100).toInt().lte(age).selfMask()

  return renameBandsToYear(mask)
}

export function nativeVegetationMask(nativeVegetationClass, year) {
  let nativeVegetationImage = ee.Image('projects/mapbiomas-workspace/DEGRADACAO/COLECAO/BETA/PROCESS/reference_native/reference_v1')

  if (year) {
    nativeVegetationImage = nativeVegetationImage.select(`classification_${year}`)
  }

  const mask = nativeVegetationImage.eq(nativeVegetationClass).selfMask()

  return renameBandsToYear(mask)
}

export function getLandUseLandCoverImage(year) {
  let lulcImage = ee.Image(LAND_USE_LAND_COVER_ASSET)

  if (year) {
    lulcImage = lulcImage.select(`classification_${year}`)
  }

  return renameBandsToYear(lulcImage)
}

export function landUseLandCoverMask(landUseLandCoverClass, year) {
  let lulcImage = getLandUseLandCoverImage(year)
  
  const mask = lulcImage.eq(landUseLandCoverClass).selfMask()

  return mask
}

function renameBandsToYear(image) {
  const bandNames = image.bandNames()
  const newBandNames = bandNames.map((bandName) => {
    return ee.String(bandName).split('_').get(-1)
  })

  return image.select(bandNames, newBandNames)
}