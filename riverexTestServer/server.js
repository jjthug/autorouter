const http = require('http');
// const mainnet_data = require('./riverex_eth_mainnet_pools.json')
const mainnet_data = require('./mainnet.json')
const polygon_data = require('./riverex_polygon.json')
const binance_data = require('./riverex_binance.json')
const moonbaseAlpha_data = require('./moobaseAlpha.json')
const shasta = require('./shasta.json')
const tron = require('./tron.json')
const PORT = 3000;

const server = http.createServer((req, res) => {
  if (req.url === '/1') {
    const jsonData = {
      message: 'Hello, world!',
      timestamp: new Date().toISOString(),
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(mainnet_data));
  } else
  if (req.url === '/80001') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(polygon_data));
  } else if (req.url === '/97') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(binance_data));
  } else if(req.url === '/1287'){
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(moonbaseAlpha_data));
  } else if(req.url === '/2494104990'){
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(shasta));
  } else if(req.url === '/728126428'){
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(tron));
  } else if(req.url === '/fail'){
    res.writeHead(200, { 'Content-Type': 'application/json' });
    const jsonResponse = {
      error: {
        code: "50010",
        message: "Data out of Sync"
      }
    };

    res.end(JSON.stringify(jsonResponse));
  }
  else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});