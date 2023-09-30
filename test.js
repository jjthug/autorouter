const axios = require('axios');

// testing endpoints
async function main(){

  const config = {
      'authorization': 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJvcmlnaW4iOiIqIiwiaXNzIjoiMTRiYzU4OTU3NDRiMGQ5MmZlZDAyYzRlOTQzNTBkZTciLCJleHAiOjI2NjE5NDIzMzQsImlhdCI6MTY2MTk0MjMzMH0.ViYoniz4ts3rzazA2x0lEkngidyKqA0RqltyWcAvuHI',
      'App-Id': 'a36302f9-c671-4417-bc05-c9dba8a3925b'
  };

  URL = "http://localhost:3000/mainnet"

  try {
    const poolsResult = await axios.get(URL)
    console.log(poolsResult)
  } catch (e) {
    console.log("error =", e);
  }
}

main();