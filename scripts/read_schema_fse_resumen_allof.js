const fs = require('fs');

try {
  const schemaStr = fs.readFileSync('docs/svfe-json-schemas/svfe-json-schemas/fe-fse-v1.json', 'utf8');
  const schema = JSON.parse(schemaStr);
  console.log('allOf in resumen:', JSON.stringify(schema.properties.resumen.allOf, null, 2));
} catch (error) {
  console.error(error);
}
