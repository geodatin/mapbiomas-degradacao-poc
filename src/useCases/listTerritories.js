import ee from '@google/earthengine'

async function listTerritories (req, res) {
  const [biomes, cities, states] = await Promise.all([
    fetchBiomes(),
    fetchCities(),
    fetchStates()
  ])

  const territorios = [...biomes, ...cities, ...states]

  return res.json({ territorios })
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
      tipo: 'bioma',
      codigo: props[0],
      nome: props[1]
    }
  })
  return biomes
}

async function fetchCities() {
  const features = ee.FeatureCollection('projects/mapbiomas-agua/assets/territories/city')
  const columns = await new Promise((resolve, reject) => {
    features.reduceColumns(ee.Reducer.toList(3), ['CODIBGE', 'NM_MUN', 'SIGLA_UF']).get('list').evaluate((list, error) => {
      if(error) {
        reject(error)
      } else {
        resolve(list)
      }
    })
  })

  const cities = columns.map((props) => {
    return {
      tipo: 'municipio',
      codigo: props[0],
      nome: `${props[1]}-${props[2]}`
    }
  })
  return cities
}

async function fetchStates() {
  const features = ee.FeatureCollection('projects/mapbiomas-agua/assets/territories/state')
  const columns = await new Promise((resolve, reject) => {
    features.reduceColumns(ee.Reducer.toList(2), ['CD_UF', 'NM_UF']).get('list').evaluate((list, error) => {
      if(error) {
        reject(error)
      } else {
        resolve(list)
      }
    })
  })

  const states = columns.map((props) => {
    return {
      tipo: 'estado',
      codigo: props[0],
      nome: props[1]
    }
  })
  return states
}

export { listTerritories }