# 📮 Postman Testing Guide - API DTE El Salvador

## 🔑 Credenciales de Prueba

```
API Key Tenant A: sk_test_2a3f0e5ab6a40b703735ed625369a4ec1960a8c1eee41970
Emisor ID A:      b7c1bae9-f393-4fd3-a79f-4b14bef8aa77
Rate Limit:       100 req/min

API Key Tenant B: sk_test_5b8fc08b4688f0ff49f088e68c4558ccc0eade2dc0eba3eb
Emisor ID B:      c9a17b77-72e1-4c29-9048-6b15b8c294cd
Rate Limit:       5 req/min
```

---

## 🌐 BASE URL
```
http://localhost:3000
```

---

## 📋 ENDPOINTS

### 1️⃣ Health Check (Público)
```
GET /api/status
```
**Headers:** Ninguno requerido

**Response esperado:**
```json
{
  "exito": true,
  "sistema": "Middleware Facturación Electrónica - El Salvador",
  "version": "2.0.0",
  "arquitectura": "Multi-Tenant SaaS"
}
```

---

### 2️⃣ Estado del Sistema (Público)
```
GET /api/dte/status
```
**Headers:** Ninguno requerido

**Response:** Muestra estado de Docker y Hacienda

---

### 3️⃣ Documento de Ejemplo (Público)
```
GET /api/dte/ejemplo
```
**Headers:** Ninguno requerido

**Response:** Estructura JSON de factura según Anexo II

---

### 4️⃣ Test de Autenticación con Hacienda ⭐
```
GET /api/dte/v2/test-auth
```
**Headers:**
```
Authorization: Bearer sk_test_2a3f0e5ab6a40b703735ed625369a4ec1960a8c1eee41970
X-Emisor-Id: b7c1bae9-f393-4fd3-a79f-4b14bef8aa77
```

**Response esperado:**
```json
{
  "exito": true,
  "mensaje": "Autenticación exitosa",
  "tokenObtenido": "Sí"
}
```

---

### 5️⃣ Test de Firma ⭐
```
POST /api/dte/v2/test-firma
```
**Headers:**
```
Authorization: Bearer sk_test_2a3f0e5ab6a40b703735ed625369a4ec1960a8c1eee41970
X-Emisor-Id: b7c1bae9-f393-4fd3-a79f-4b14bef8aa77
Content-Type: application/json
```
**Body (raw JSON):**
```json
{
  "test": "documento de prueba",
  "datos": {
    "valor": 123
  }
}
```

---

### 6️⃣ Crear Factura Electrónica (DTE-01) ⭐⭐⭐
```
POST /api/dte/v2/facturar
```
**Headers:**
```
Authorization: Bearer sk_test_2a3f0e5ab6a40b703735ed625369a4ec1960a8c1eee41970
X-Emisor-Id: b7c1bae9-f393-4fd3-a79f-4b14bef8aa77
Content-Type: application/json
```
**Body (raw JSON):**
```json
{
  "tipoDte": "01",
  "receptor": {
    "tipoDocumento": "36",
    "numDocumento": "06141802941035",
    "nombre": "CLIENTE DE PRUEBA SA DE CV",
    "direccion": {
      "departamento": "06",
      "municipio": "14",
      "complemento": "COLONIA ESCALÓN, CALLE EJEMPLO #123"
    },
    "telefono": "22223333",
    "correo": "cliente@ejemplo.com"
  },
  "items": [
    {
      "descripcion": "SERVICIO DE CONSULTORIA",
      "cantidad": 1,
      "precioUnitario": 100.00,
      "tipoItem": 2
    },
    {
      "descripcion": "PRODUCTO EJEMPLO",
      "cantidad": 2,
      "precioUnitario": 25.50,
      "codigo": "PROD001",
      "tipoItem": 1
    }
  ],
  "condicionOperacion": 1
}
```

**Response esperado (éxito):**
```json
{
  "exito": true,
  "mensaje": "Factura procesada exitosamente",
  "datos": {
    "codigoGeneracion": "UUID-GENERADO",
    "numeroControl": "DTE-01-M001P001-000000001",
    "selloRecibido": "SELLO-DE-HACIENDA",
    "fechaProcesamiento": "2026-02-09T..."
  }
}
```

---

### 7️⃣ Crear Crédito Fiscal (DTE-03)
```
POST /api/dte/v2/facturar
```
**Headers:** (mismos que DTE-01)

**Body:**
```json
{
  "tipoDte": "03",
  "receptor": {
    "tipoDocumento": "36",
    "numDocumento": "06140101941234",
    "nrc": "1234567",
    "nombre": "EMPRESA CONTRIBUYENTE SA DE CV",
    "codActividad": "46900",
    "descActividad": "VENTA AL POR MAYOR",
    "direccion": {
      "departamento": "06",
      "municipio": "14",
      "complemento": "ZONA INDUSTRIAL"
    },
    "telefono": "22224444",
    "correo": "empresa@ejemplo.com"
  },
  "items": [
    {
      "descripcion": "INSUMOS INDUSTRIALES",
      "cantidad": 10,
      "precioUnitario": 50.00,
      "tipoItem": 1
    }
  ],
  "condicionOperacion": 2
}
```

---

### 8️⃣ Listar Facturas del Tenant
```
GET /api/dte/v2/facturas
```
**Headers:**
```
Authorization: Bearer sk_test_2a3f0e5ab6a40b703735ed625369a4ec1960a8c1eee41970
X-Emisor-Id: b7c1bae9-f393-4fd3-a79f-4b14bef8aa77
```

**Query params opcionales:**
```
?tipoDte=01
?status=PROCESADO
?page=1
?limit=20
```

---

### 9️⃣ Consultar Factura Específica
```
GET /api/dte/v2/factura/{codigoGeneracion}
```
**Headers:**
```
Authorization: Bearer sk_test_2a3f0e5ab6a40b703735ed625369a4ec1960a8c1eee41970
X-Emisor-Id: b7c1bae9-f393-4fd3-a79f-4b14bef8aa77
```

**Ejemplo:**
```
GET /api/dte/v2/factura/550e8400-e29b-41d4-a716-446655440000
```

---

### 🔟 Estadísticas del Tenant
```
GET /api/dte/v2/estadisticas
```
**Headers:**
```
Authorization: Bearer sk_test_2a3f0e5ab6a40b703735ed625369a4ec1960a8c1eee41970
X-Emisor-Id: b7c1bae9-f393-4fd3-a79f-4b14bef8aa77
```

**Query params:**
```
?periodo=mes   (mes, semana, dia)
```

---

## ⚠️ Códigos de Error

| Código | Significado |
|--------|-------------|
| 200 | Éxito |
| 400 | Datos inválidos |
| 401 | API Key inválida o faltante |
| 403 | Sin permisos |
| 404 | DTE no encontrado |
| 429 | Rate limit excedido |
| 500 | Error interno |

---

## 🔄 Tipos de DTE

| Código | Nombre |
|--------|--------|
| 01 | Factura Electrónica |
| 03 | Crédito Fiscal |
| 05 | Nota de Crédito |
| 06 | Nota de Débito |
| 11 | Factura de Exportación |
| 14 | Factura Sujeto Excluido |

---

## 🛡️ Headers Requeridos (Rutas Protegidas)

```
Authorization: Bearer {tu_api_key}
X-Emisor-Id: {uuid_del_emisor}
Content-Type: application/json
```
