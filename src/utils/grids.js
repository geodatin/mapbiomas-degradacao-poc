import database from '../../infra/database.js'

export const GRID_ASSET = 'projects/mapbiomas-agua/assets/gridBrazil'

export async function findGridIds(territoryId) {
  const result = await database.query({
    text: "SELECT grid_id FROM territories_grids WHERE territory_id = $1;",
    values: [territoryId],
  })
  const gridIds = result.rows.map((grid) => grid.grid_id)
  return gridIds
}

export function splitIntoChunks(array, chunksize) {
  const arrays = []

  for (let i = 0; i < array.length; i += chunksize) {
    arrays.push(array.slice(i, i + chunksize))
  }

  return arrays
}