import ee from '@google/earthengine'

import privateKey from '../../.private-key.json' assert { type: "json" };

// Initialize client library
export async function initializeEarthEngine() {
  // Authenticate using a service account.
  return new Promise((resolve, reject) => {
    ee.data.authenticateViaPrivateKey(
      privateKey,
      () => {
        ee.initialize(
          null,
          null,
          function () {
            console.log('EarthEngine initialized.')
            resolve()
          },
          function (e) {
            console.error('Initialization error: ' + e)
            reject(e)
          },
        )
      },
      function (e) {
        console.error('Authentication error: ' + e)
        reject(e)
      },
    )
  })
}
