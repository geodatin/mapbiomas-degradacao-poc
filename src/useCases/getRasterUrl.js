import ee from '@google/earthengine'
import { findTerritory, getTerritoryMask } from '../utils/territories.js'

async function getRasterUrl(req, res) {
  let { assetId, pixelValues, colors, territoryId } = req.query

  if (!assetId) {
    return res.status(400).json({ error: `'assetId' is required`})
  }

  if (!pixelValues) {
    return res.status(400).json({ error: `'pixelValues' is required` })
  }

  if (!colors) {
    return res.status(400).json({ error: `'colors' is required` })
  }

  if (pixelValues.length === 0) {
    return res.status(400).json({ error: `'pixelValues' must contain at least 1 value` })
  }

  if (pixelValues.length !== colors.length) {
    return res.status(400).json({ error: `'pixelValues' and 'colors' must have the same length.`})
  }

  pixelValues = pixelValues.map((value) => Number(value))

  const image = ee.Image(assetId)

  const bandNames = await getBandNames(image)
  const lastBand = bandNames[bandNames.length - 1]
  const selectedBand = image.select(lastBand)

  let masked = updateImageMask(selectedBand, pixelValues)

  if (territoryId) {
    territoryId = Number(territoryId)

    const territory = await findTerritory(territoryId)

    if (!territory) {
      return res.status(400).json({ error: 'Territory not found' })
    }

    const territoryMask = getTerritoryMask(territory.category, territory.id)
    masked = masked.updateMask(territoryMask)
  }

  const visParams = generateVisParams(pixelValues, colors)

  const url = await getMap(masked, visParams)

  return res.json({ url })
}

async function getBandNames(image) {
  return await new Promise((resolve, reject) => {
    image.bandNames().evaluate((bands, error) => {
      if (error) {
        reject(error)
      } else {
        resolve(bands)
      }
    })
  })
}

function updateImageMask(image, pixelValues) {
  if (pixelValues.length === 0) {
    return image
  }

  const firstValue = pixelValues[0]
  let mask = image.eq(firstValue)
  for(let i = 1; i < pixelValues.length; i++) {
    mask = mask.or(image.eq(pixelValues[i]))
  }

  const masked = image.updateMask(mask)

  return masked
}

function generateVisParams(pixelValues, colors) {
  const maxValue = Math.max(...pixelValues)
  const minValue = Math.min(...pixelValues)
  const valueToColor = pixelValues.reduce((obj, value, index) => {
    obj[value] = colors[index]
    return obj
  }, {})

  const palette = []
  for(let i = minValue; i <= maxValue; i++) {
    const color = valueToColor[i]
    if (color) {
      palette.push(color)
    } else {
      palette.push('#000000')
    }
  }

  const visParams = {
    min: minValue,
    max: maxValue,
    palette
  }

  return visParams
}

async function getMap(image, visParams) {
  return new Promise((resolve, reject) => {
    image.getMap(visParams, (map, error) => {
      if (error) {
        reject(error)
      } else {
        const { urlFormat: url } = map
        resolve(url)
      }
    })
  })
}

export { getRasterUrl }