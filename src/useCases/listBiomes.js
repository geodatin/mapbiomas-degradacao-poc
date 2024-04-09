import ee from '@google/earthengine'

async function listBiomes(req, res) {
  const biomes = await fetchBiomes()

  return res.json(biomes)
}

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
      code: props[0],
      name: props[1]
    }
  })
  return biomes
}

export { listBiomes } 