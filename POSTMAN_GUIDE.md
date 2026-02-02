# Guía de Uso: API REST con Postman

## Iniciar el Servidor

Primero, inicia el servidor Express:

```bash
npm run dev
```

El servidor estará disponible en: **http://localhost:3000**

---

## Endpoints Disponibles

### 1. GET / - Información del Sistema

**URL:** `http://localhost:3000/`

**Método:** GET

**Respuesta:**
```json
{
  "nombre": "Middleware Facturación Electrónica",
  "pais": "El Salvador",
  "version": "1.0.0",
  "normativa": "Anexo II - DTE",
  "descripcion": "API REST para generación, firma y transmisión de DTEs",
  "endpoints": {
    "estado": "GET /api/status",
    "facturar": "POST /api/facturar",
    "consultar": "GET /api/factura/:codigoGeneracion",
    "ejemplo": "GET /api/ejemplo",
    "testFirma": "POST /api/test-firma",
    "testAuth": "GET /api/test-auth"
  },
  "documentacion": "Ver README.md"
}
```

---

### 2. GET /api/status - Estado del Sistema

**URL:** `http://localhost:3000/api/status`

**Método:** GET

**Descripción:** Verifica el estado de todos los componentes (Docker firmador + API Hacienda)

**Respuesta:**
```json
{
  "exito": true,
  "sistema": "Middleware Facturación Electrónica - El Salvador",
  "version": "1.0.0",
  "componentes": {
    "servidor": {
      "online": true,
      "mensaje": "API funcionando"
    },
    "docker": {
      "online": true,
      "mensaje": "Docker Firmador activo"
    },
    "hacienda": {
      "online": true,
      "mensaje": "Autenticación exitosa"
    }
  },
  "timestamp": "2026-02-01T23:46:00.000Z"
}
```

---

### 3. GET /api/test-auth - Probar Autenticación

**URL:** `http://localhost:3000/api/test-auth`

**Método:** GET

**Descripción:** Prueba la autenticación con el Ministerio de Hacienda (obtiene token)

**Respuesta:**
```json
{
  "exito": true,
  "mensaje": "Autenticación exitosa",
  "tokenObtenido": "Sí (por seguridad no se muestra)"
}
```

---

### 4. GET /api/ejemplo - Documento de Ejemplo

**URL:** `http://localhost:3000/api/ejemplo`

**Método:** GET

**Descripción:** Genera un documento DTE de ejemplo según Anexo II (sin firmar ni enviar)

**Respuesta:**
```json
{
  "exito": true,
  "mensaje": "Documento de ejemplo generado según Anexo II",
  "nota": "Este documento NO ha sido firmado ni enviado a Hacienda",
  "documento": {
    "identificacion": {
      "version": 1,
      "ambiente": "00",
      "tipoDte": "01",
      "numeroControl": "DTE-01-...",
      "codigoGeneracion": "UUID...",
      ...
    },
    "emisor": {...},
    "receptor": {...},
    "cuerpoDocumento": [...],
    "resumen": {...}
  }
}
```

---

### 5. POST /api/facturar - Crear Factura (Flujo Completo)

**URL:** `http://localhost:3000/api/facturar`

**Método:** POST

**Headers:**
```
Content-Type: application/json
```

**Body (JSON):**
```json
{
  "emisor": {
    "nit": "070048272",
    "nrc": "123456",
    "nombre": "MI EMPRESA SA DE CV",
    "codActividad": "62020",
    "descActividad": "CONSULTORIA INFORMATICA",
    "nombreComercial": "MI EMPRESA",
    "tipoEstablecimiento": "01",
    "direccion": {
      "departamento": "14",
      "municipio": "04",
      "complemento": "COLONIA ESCALON"
    },
    "telefono": "22222222",
    "correo": "empresa@prueba.com"
  },
  "receptor": {
    "tipoDocumento": "36",
    "numDocumento": "06142803901121",
    "nrc": "654321",
    "nombre": "CLIENTE PRUEBA SA DE CV",
    "codActividad": "47190",
    "descActividad": "COMERCIO AL POR MENOR",
    "direccion": {
      "departamento": "06",
      "municipio": "14",
      "complemento": "SAN SALVADOR"
    },
    "telefono": "77777777",
    "correo": "cliente@test.com"
  },
  "items": [
    {
      "descripcion": "LAPTOP DELL INSPIRON 15",
      "cantidad": 2,
      "precioUnitario": 650.00,
      "codigo": "PROD001",
      "tipoItem": 1
    },
    {
      "descripcion": "SERVICIO DE INSTALACION",
      "cantidad": 1,
      "precioUnitario": 75.00,
      "codigo": "SRV001",
      "tipoItem": 2
    }
  ],
  "tipoDte": "01",
  "correlativo": 1,
  "condicionOperacion": 1
}
```

**Respuesta Exitosa:**
```json
{
  "exito": true,
  "mensaje": "Factura procesada exitosamente por el Ministerio de Hacienda",
  "datos": {
    "codigoGeneracion": "A1B2C3D4-E5F6-7890-ABCD-EF1234567890",
    "numeroControl": "DTE-01-00000001-000000001",
    "selloRecibido": "SELLO_MH_...",
    "fechaProcesamiento": "2026-02-01T23:46:00.000Z",
    "estado": "PROCESADO"
  },
  "documento": {...},
  "documentoFirmado": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Respuesta Error:**
```json
{
  "exito": false,
  "mensaje": "Factura rechazada por Hacienda",
  "error": {...},
  "observaciones": ["Error 1", "Error 2"]
}
```

---

### 6. POST /api/transmitir - Transmitir DTE Completo

**URL:** `http://localhost:3000/api/transmitir`

**Método:** POST

**Descripción:** Transmite un documento DTE completo (JSON Anexo II ya armado). Útil cuando ya tienes el JSON completo.

**Headers:**
```
Content-Type: application/json
```

**Body:** JSON completo del Anexo II (obtener ejemplo de `/api/ejemplo`)

---

### 7. GET /api/factura/:codigoGeneracion - Consultar Estado

**URL:** `http://localhost:3000/api/factura/{CODIGO-GENERACION}`

**Método:** GET

**Ejemplo:** `http://localhost:3000/api/factura/A1B2C3D4-E5F6-7890-ABCD-EF1234567890`

**Respuesta:**
```json
{
  "exito": true,
  "datos": {
    "estado": "PROCESADO",
    "selloRecibido": "...",
    "observaciones": []
  }
}
```

---

### 8. POST /api/test-firma - Probar Firma

**URL:** `http://localhost:3000/api/test-firma`

**Método:** POST

**Descripción:** Prueba la firma de cualquier JSON (sin enviar a Hacienda)

**Body:** Cualquier JSON
```json
{
  "prueba": "datos",
  "numero": 123
}
```

**Respuesta:**
```json
{
  "exito": true,
  "mensaje": "Documento firmado correctamente",
  "firma": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

## Flujo Recomendado para Pruebas en Postman

### Paso 1: Verificar que todo esté listo
```
GET http://localhost:3000/api/status
```
**Resultado esperado:** Todos los componentes `online: true`

---

### Paso 2: Probar autenticación
```
GET http://localhost:3000/api/test-auth
```
**Resultado esperado:** `exito: true, tokenObtenido: "Sí"`

---

### Paso 3: Obtener estructura de ejemplo
```
GET http://localhost:3000/api/ejemplo
```
**Resultado esperado:** JSON completo del DTE para referencia

---

### Paso 4: Crear factura de prueba
```
POST http://localhost:3000/api/facturar
```
**Body:** Usa el JSON de ejemplo anterior modificando los datos

**Resultado esperado:** 
- `exito: true`
- `selloRecibido` del MH
- `codigoGeneracion` para consultas futuras

---

### Paso 5: Consultar estado de la factura
```
GET http://localhost:3000/api/factura/{codigoGeneracion}
```
Donde `{codigoGeneracion}` es el UUID del paso anterior

**Resultado esperado:** `estado: "PROCESADO"`

---

## Colección de Postman

### Importar Colección

Puedes importar esta colección JSON en Postman:

```json
{
  "info": {
    "name": "Ministerio de Hacienda - DTE API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "1. Info del Sistema",
      "request": {
        "method": "GET",
        "header": [],
        "url": {
          "raw": "http://localhost:3000/",
          "protocol": "http",
          "host": ["localhost"],
          "port": "3000",
          "path": [""]
        }
      }
    },
    {
      "name": "2. Estado del Sistema",
      "request": {
        "method": "GET",
        "header": [],
        "url": {
          "raw": "http://localhost:3000/api/status",
          "protocol": "http",
          "host": ["localhost"],
          "port": "3000",
          "path": ["api", "status"]
        }
      }
    },
    {
      "name": "3. Test Autenticación MH",
      "request": {
        "method": "GET",
        "header": [],
        "url": {
          "raw": "http://localhost:3000/api/test-auth",
          "protocol": "http",
          "host": ["localhost"],
          "port": "3000",
          "path": ["api", "test-auth"]
        }
      }
    },
    {
      "name": "4. Obtener Ejemplo DTE",
      "request": {
        "method": "GET",
        "header": [],
        "url": {
          "raw": "http://localhost:3000/api/ejemplo",
          "protocol": "http",
          "host": ["localhost"],
          "port": "3000",
          "path": ["api", "ejemplo"]
        }
      }
    },
    {
      "name": "5. Crear Factura Completa",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"emisor\": {\n    \"nit\": \"070048272\",\n    \"nrc\": \"123456\",\n    \"nombre\": \"MI EMPRESA SA DE CV\",\n    \"codActividad\": \"62020\",\n    \"descActividad\": \"CONSULTORIA INFORMATICA\",\n    \"nombreComercial\": \"MI EMPRESA\",\n    \"tipoEstablecimiento\": \"01\",\n    \"direccion\": {\n      \"departamento\": \"14\",\n      \"municipio\": \"04\",\n      \"complemento\": \"COLONIA ESCALON\"\n    },\n    \"telefono\": \"22222222\",\n    \"correo\": \"empresa@prueba.com\"\n  },\n  \"receptor\": {\n    \"tipoDocumento\": \"36\",\n    \"numDocumento\": \"06142803901121\",\n    \"nrc\": \"654321\",\n    \"nombre\": \"CLIENTE PRUEBA SA DE CV\",\n    \"codActividad\": \"47190\",\n    \"descActividad\": \"COMERCIO AL POR MENOR\",\n    \"direccion\": {\n      \"departamento\": \"06\",\n      \"municipio\": \"14\",\n      \"complemento\": \"SAN SALVADOR\"\n    },\n    \"telefono\": \"77777777\",\n    \"correo\": \"cliente@test.com\"\n  },\n  \"items\": [\n    {\n      \"descripcion\": \"LAPTOP DELL INSPIRON 15\",\n      \"cantidad\": 2,\n      \"precioUnitario\": 650.00,\n      \"codigo\": \"PROD001\",\n      \"tipoItem\": 1\n    }\n  ],\n  \"tipoDte\": \"01\",\n  \"correlativo\": 1,\n  \"condicionOperacion\": 1\n}"
        },
        "url": {
          "raw": "http://localhost:3000/api/facturar",
          "protocol": "http",
          "host": ["localhost"],
          "port": "3000",
          "path": ["api", "facturar"]
        }
      }
    },
    {
      "name": "6. Consultar Factura",
      "request": {
        "method": "GET",
        "header": [],
        "url": {
          "raw": "http://localhost:3000/api/factura/{{codigoGeneracion}}",
          "protocol": "http",
          "host": ["localhost"],
          "port": "3000",
          "path": ["api", "factura", "{{codigoGeneracion}}"]
        }
      }
    },
    {
      "name": "7. Test Firma",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"prueba\": \"documento de prueba\",\n  \"numero\": 123\n}"
        },
        "url": {
          "raw": "http://localhost:3000/api/test-firma",
          "protocol": "http",
          "host": ["localhost"],
          "port": "3000",
          "path": ["api", "test-firma"]
        }
      }
    }
  ]
}
```

---

## Cómo Iniciar

### 1. Terminal 1: Servidor API

```bash
cd d:\DTE-Planing\FAC-ELECTRONICA
npm run dev
```

### 2. Postman: Probar Endpoints

1. Abrir Postman
2. Importar la colección JSON de arriba
3. Empezar con `GET /api/status`
4. Continuar con los demás endpoints

---

## Diferencias: npm test vs API REST

| Aspecto | `npm test` | API REST (Postman) |
|---------|------------|-------------------|
| **Uso** | Pruebas automatizadas | Pruebas manuales/integración |
| **Servidor** | No requiere servidor | Requiere `npm run dev` |
| **Control** | Scripts predefinidos | Control total del JSON |
| **Logs** | Guardados automáticamente | Respuestas visuales |
| **Propósito** | Certificación MH masiva | Desarrollo/depuración |

---

## Tips para Postman

### Variables de Entorno

Crear variable `baseUrl` = `http://localhost:3000`

Usar: `{{baseUrl}}/api/status`

### Guardar Código de Generación

En "Tests" del endpoint "Crear Factura":

```javascript
var jsonData = pm.response.json();
if (jsonData.exito) {
    pm.environment.set("codigoGeneracion", jsonData.datos.codigoGeneracion);
}
```

Luego usar `{{codigoGeneracion}}` en consultas.

---

## ¿Problemas?

### Error: "Cannot GET /api/..."
- Verifica que el servidor esté corriendo (`npm run dev`)

### Error: "Docker Firmador no responde"
- Ejecuta `docker ps` para verificar contenedor
- Reinicia: `docker-compose restart`

### Error: "Error de autenticación MH"
- Verifica credenciales en `.env`
- Prueba primero  con `GET /api/test-auth`

---

¡Listo para usar con Postman! 🚀
