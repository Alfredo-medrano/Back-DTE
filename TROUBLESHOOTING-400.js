/**
 * Guía rápida de solución de problemas 400 Bad Request
 */

// PROBLEMAS COMUNES CON 400 BAD REQUEST DEL MH:

// 1. CANTIDAD debe tener SOLO 2 decimales (no más)
//    ❌ "cantidad": 2.00000000
//    ✅ "cantidad": 2

// 2. PRECIOS deben tener SOLO 2 decimales
//    ❌ "precioUni": 650.00000000
//    ✅ "precioUni": 650.00

// 3. UNIDAD DE MEDIDA para servicios debe ser 99 (no 59)
//    ❌ "uniMedida": 59, "tipoItem": 2
//    ✅ "uniMedida": 99, "tipoItem": 2

// 4. NRC del receptor puede ser opcional (null) si no tiene
//    ✅ "nrc": null  (para receptores sin NRC)

// 5. CÓDIGOS Y DESCRIPCIONES en mayúsculas
//    ✅ "descripcion": "LAPTOP DELL"

// 6. FECHA debe ser YYYY-MM-DD
//    ✅ "fecEmi": "2026-02-02"

// 7. HORA debe ser HH:MM:SS  
//    ✅ "horEmi": "22:09:11"

console.log('Ver servidor para detalles del error MH');
