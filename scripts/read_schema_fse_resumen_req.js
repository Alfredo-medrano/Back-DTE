const fs = require('fs');

try {
  const schemaStr = fs.readFileSync('docs/svfe-json-schemas/svfe-json-schemas/fe-fse-v1.json', 'utf8');
  const schema = JSON.parse(schemaStr);
  console.log('required bits of resumen:', JSON.stringify(schema.properties.resumen.required, null, 2));
} catch (error) {
  console.error(error);
}
