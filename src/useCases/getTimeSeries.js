import ee from '@google/earthengine'
import { fireAgeMask, edgeAreaMask, patchSizeMask, isolationMask, secondaryVegetationAgeMask, nativeVegetationMask, getLandUseLandCoverImage } from '../utils/masks.js'
import { getTerritoryFeature, findTerritory, getTerritoryMask } from '../utils/territories.js'

async function getTimeSeries(req, res) {
  let { territoryId } = req.params
  let {
    fireAge,
    edgeArea, 
    patchSize, 
    isolation, 
    secondaryVegetationAge, 
    nativeVegetationClass
  } = req.query

  console.log('Request URL:', req.originalUrl)

  fireAge = Number(fireAge)
  secondaryVegetationAge = Number(secondaryVegetationAge)
  nativeVegetationClass = Number(nativeVegetationClass)

  let image = ee.Image(0)

  if (fireAge) {
    const mask = fireAgeMask(fireAge)
    image = image.or(mask)
  }

  if (edgeArea) {
    const mask = edgeAreaMask(edgeArea)
    image = image.or(mask)
  }

  if (patchSize) {
    const mask = patchSizeMask(patchSize)
    image = image.or(mask)
  }

  if (isolation) {
    const mask = isolationMask(isolation)
    image = image.or(mask)
  }

  if (secondaryVegetationAge) {
    const mask = secondaryVegetationAgeMask(secondaryVegetationAge)
    image = image.or(mask)
  }

  if (nativeVegetationClass) {
    const mask = nativeVegetationMask(nativeVegetationClass)
    image = image.or(mask)
  }

  const territory = await findTerritory(territoryId)

  if (!territory) {
    return res.status(400).json({ error: 'Territory not found' })
  }

  const territoryMask = getTerritoryMask(territory.category, territory.id)

  image = image.updateMask(territoryMask)

  const bands = await new Promise((resolve, reject) => {
    image.bandNames().evaluate((bands, error) => {
      if(error) {
        reject(error)
      } else {
        resolve(bands)
      }
    })
  })

  const lulcImage = getLandUseLandCoverImage().select(bands)

  const territoryFeature = getTerritoryFeature(territory.category, territory.id)

  const geometry = territoryFeature.geometry().bounds()
  
  console.time('compute area')
  const areas = await Promise.all(
    bands.map(async (band) => {
      const yearMask = image.select([band])
      const yearLulc = lulcImage.select([band])
      const year = Number(band)

      const area = await computeArea(geometry, yearMask, yearLulc, year)

      return area
    })
  )
  console.timeEnd('compute area')
  
  return res.json({ areas: areas.flat() })
}

async function computeArea(geometry, mask, lulcImage, year) {
  const pixelArea = ee.Image.pixelArea().divide(10000)
  const maskedArea = mask.multiply(pixelArea)

  const areaWithClasses = maskedArea.addBands(lulcImage)

  const reducedArea = areaWithClasses.reduceRegion({
    reducer: ee.Reducer.sum().group(1, 'class'),
    geometry: geometry,
    scale: 30,
    maxPixels: 1e13
  })

  const values = ee.List(reducedArea.get('groups')).map((element) => {
    element = ee.Dictionary(element)
    return {
      year: year,
      class: element.get('class'),
      areaHa: element.get('sum')
    }
  })

  const areas = await new Promise((resolve, reject) => {
    values.evaluate((areas, error) => {
      if (error) {
        reject(error)
      } else {
        resolve(areas)
      }
    })
  })
  return areas
}

export { getTimeSeries }