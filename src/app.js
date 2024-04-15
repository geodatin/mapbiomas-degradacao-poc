import 'dotenv/config.js'
import 'express-async-errors'
import cors from 'cors'
import express from 'express'
import swaggerUi from 'swagger-ui-express'
import swaggerFile from '../swagger.json' assert { type: "json" };

import { listTerritories } from './useCases/listTerritories.js';
import { getArea } from './useCases/getArea.js'
import { getAreaByClass } from './useCases/getAreaByClass.js'
import { listBiomes } from './useCases/listBiomes.js'
import { getRasterUrl } from './useCases/getRasterUrl.js';

const app = express()

app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use(
  '/api/docs',
  swaggerUi.serve,
  swaggerUi.setup(swaggerFile, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Mapbiomas Degradação',
    swaggerOptions: {
      syntaxHighlight: false,
    },
  }),
)

app.get('/api/v1/territories', listTerritories)

app.get('/api/v1/biomes', listBiomes)

app.get('/api/v1/raster', getRasterUrl)

app.get('/api/v1/area/:territoryType/:territoryName/:year/:method', getArea)

app.get('/api/v1/area-by-class/:territoryType/:territoryName/:year/:method', getAreaByClass)

export { app }