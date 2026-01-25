import { deriveAreaAndPincode } from './controllers/groupController.js';

// Test with Manjhaul, Begusarai coordinates
async function testGeocode() {
  const lat = 25.4167;
  const lng = 86.1333;

  console.log(`Testing geocoding for lat: ${lat}, lng: ${lng}`);

  try {
    const result = await deriveAreaAndPincode(lat, lng);
    console.log('Result:', result);
  } catch (error) {
    console.error('Error:', error);
  }
}

testGeocode();
