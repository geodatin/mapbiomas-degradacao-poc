import 'dotenv/config.js'
import 'express-async-errors'
import express from 'express'
import swaggerUi from 'swagger-ui-express'
import swaggerFile from '../swagger.json' assert { type: "json" };

import { listTerritories } from './useCases/listTerritories.js';
import { computeStatistics } from './useCases/computeStatistics.js'

const app = express()

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

app.get('/api/v1/statistics/:territoryType/:territoryName/:year/:method', computeStatistics)

export { app }