// Simple test for BigDataCloud API
async function testAPI() {
  const lat = 25.4167;
  const lng = 86.1333;

  console.log(`Testing API for lat: ${lat}, lng: ${lng}`);

  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`;
    const res = await fetch(url);

    if (res.ok) {
      const json = await res.json();
      console.log('API Response:', JSON.stringify(json, null, 2));

      const localityInfo = json.localityInfo || {};
      const administrative = localityInfo.administrative || [];
      const informative = localityInfo.informative || [];

      console.log('Administrative:', administrative);
      console.log('Informative:', informative);

      const area = administrative.find((a: any) => a.description === 'city' || a.description === 'state')?.name || administrative[0]?.name || '';
      const postalInfo = informative.find((i: any) => i.description === 'postal code');
      const postcode = postalInfo?.name || '';

      console.log('Area:', area);
      console.log('Postcode:', postcode);
    } else {
      console.log('API failed with status:', res.status);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

testAPI();
