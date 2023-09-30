const http = require('http');
// const mainnet_data = require('./riverex_eth_mainnet_pools.json')
const mainnet_data = require('./2.json')
const polygon_data = require('./riverex_polygon.json')
const binance_data = require('./riverex_binance.json')
const PORT = 3000;

const server = http.createServer((req, res) => {
  if (req.url === '/mainnet') {
    const jsonData = {
      message: 'Hello, world!',
      timestamp: new Date().toISOString(),
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    for (const k in mainnet_data) {
    }
    res.end(JSON.stringify(mainnet_data));
  } else

  if (req.url === '/polygon') {

    res.writeHead(200, { 'Content-Type': 'application/json' });
    for (const k in polygon_data) {
    }
    res.end(JSON.stringify(polygon_data));
  } else if ('/binance') {

    res.writeHead(200, { 'Content-Type': 'application/json' });
    for (const k in binance_data) {
    }
    res.end(JSON.stringify(binance_data));
  }
  else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});