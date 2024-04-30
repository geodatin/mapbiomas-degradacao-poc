import { selectTerritories } from "../utils/territories.js"

async function listTerritories (req, res) {
  const territories = await selectTerritories()

  return res.json({ territories })
}

export { listTerritories }