const fs = require('fs');
//read the JSON file

let files = ["riverex_polygon"]

files.forEach((filename) => {
  fs.readFile(`./${filename}.json`, 'utf8', (err, data) => {
    if (err) throw err;

    // parse the JSON file
    let jsonData = JSON.parse(data);

    // iterate over "pairs" array and add the new field
    jsonData.pairs.forEach(pair => {
      const reserveUsd = parseFloat(pair.reserveUsd, 10);
      pair.reserveETH = (reserveUsd * 0.0005).toString();
    });

    // update the JSON file
    fs.writeFile(`./${filename}.json`, JSON.stringify(jsonData, null, 2), 'utf8', err => {
      if (err) throw err;
      console.log('JSON file updated successfully');
    });
  });
})
