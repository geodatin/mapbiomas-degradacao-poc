import ee from '@google/earthengine'
import database from '../../infra/database.js'

const categories = ['country', 'biome', 'state']

export async function selectTerritories() {
  const result = await database.query({
    text: "SELECT id, category, name FROM territories ORDER BY id"
  })
  const territories = result.rows
  return territories
}

export async function findTerritory(territoryId) {
  const result = await database.query({
    text: "SELECT id, category, name FROM territories WHERE id = $1;",
    values: [territoryId],
  })
  const territory = result.rows[0]
  return territory
}

export function getTerritoryFeature(territoryCategory, territoryId) {
  if (categories.includes(territoryCategory)) {
    const feature = ee.Feature(
      ee.FeatureCollection(`projects/mapbiomas-agua/assets/degradacao/territories/${territoryCategory}`)
        .filter(ee.Filter.eq('ID', territoryId))
        .first()
    )
    return feature.select(['ID', 'STRING_VAL'], ['id', 'name'])
  }
}

export function getTerritoryMask(territoryCategory, territoryId) {
  if (categories.includes(territoryCategory)) {
    const assetId = `projects/mapbiomas-agua/assets/degradacao/images/${territoryCategory}`
    const mask = ee.Image(assetId)
      .eq(territoryId)
      .selfMask()
    return mask
  }
}