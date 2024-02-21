import { app } from "./app.js"
import { initializeEarthEngine } from "./earthengine/index.js"

initializeEarthEngine().then(() => {
  app.listen(8080, () => {
    console.log('Server listening on port 8080.')
  })
})
