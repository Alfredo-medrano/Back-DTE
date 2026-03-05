const http = require('http');

const body = JSON.stringify({
    tipoDte: '03',
    receptor: {
        tipoDocumento: '36',
        numDocumento: '12172305071014',
        nit: '12172305071014',
        nrc: '179946-0',
        nombre: 'CONTRIBUYENTE DE PRUEBA',
        codActividad: '46900',
        descActividad: 'VENTA AL POR MAYOR',
        direccion: {
            departamento: '06',
            municipio: '14',
            complemento: 'SAN SALVADOR',
        },
        telefono: '22224444',
        correo: 'empresa@ejemplo.com',
    },
    items: [
        {
            descripcion: 'INSUMOS INDUSTRIALES',
            cantidad: 10,
            precioUnitario: 50.00,
            tipoItem: 1,
        },
    ],
    condicionOperacion: 2,
});

const req = http.request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/dte/v2/facturar',
    method: 'POST',
    headers: {
        'Authorization': 'Bearer sk_test_2a3f0e5ab6a40b703735ed625369a4ec1960a8c1eee41970',
        'X-Emisor-Id': 'b7c1bae9-f393-4fd3-a79f-4b14bef8aa77',
        'Content-Type': 'application/json',
    },
}, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        console.log('STATUS:', res.statusCode);
        console.log(JSON.stringify(JSON.parse(data), null, 2));
    });
});

req.write(body);
req.end();
