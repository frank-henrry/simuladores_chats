# Demo: sistema de facturación de la empresa (paso a paso)

Este proyecto **no es parte de `virtualfact_chats`** — vive aparte a propósito. Simula el backend del sistema de facturación de la empresa: un integrador **distinto** del portal cliente (ver `../../cliente/` para ese) y del módulo de agentes (ver `../crm-agentes/`), con su propia base de datos de clientes/PDFs y su propia llave (`EMPRESAS_API_KEY`).

Sirve para dos cosas:
1. **Probar hoy mismo** que mandar y leer facturas funciona de verdad.
2. **Dárselo al equipo de facturación** como referencia de las dos operaciones que necesitan: mandar una factura y leer de vuelta el registro para pintarlo en su propio front (no usan nuestro CRM).

## Cómo está armado

```
empresas/facturacion/
├── enviar-factura.php   <- manda una factura (la única pieza que conoce la llave)
├── listar-facturas.php  <- lee de vuelta el registro
├── pdf.php               <- genera el PDF real de la factura
├── index.html            <- enviar facturas + tabla de "facturas registradas"
├── app.js                 <- toda la lógica del navegador
├── Dockerfile              <- php:8.2-apache
└── .env                    <- config local (no se sube a ningún repositorio)
```

## Paso a paso de la implementación

### Paso 1 — mandar una factura (`enviar-factura.php`)

```php
$postFields = [
    'externalCustomerId' => $externalCustomerId,
    'invoiceNumber' => $numeroFactura,
    'amount' => $monto,
    // currency, dueDate, displayName opcionales
    'file' => new CURLFile($tmpFile, 'application/pdf', "factura-$numeroFactura.pdf"),
];
$ch = curl_init($coreApiUrl . '/integration/invoices');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $postFields, // multipart/form-data automático por el CURLFile
    CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $empresasApiKey],
]);
```

Esto **no toca ninguna conversación** — la factura es un recurso aparte del chat (hallazgo real de revisión: mezclarlas no dejaba gestionar todas las facturas juntas). `externalCustomerId` es el mismo RUC que usa el portal cliente para identificar a ese cliente — así el CRM sabe que es la misma empresa.

### Paso 2 — leer de vuelta el registro (`listar-facturas.php`)

Esto es lo nuevo: no solo mandamos, también **leemos** — para pintar en nuestro propio front qué se envió y si ya se marcó pagado (eso lo hace el personal de soporte a mano, en el CRM, después de revisar el comprobante que el cliente manda por chat o por su propio módulo de pago).

```php
$ch = curl_init($coreApiUrl . '/integration/invoices?externalCustomerId=' . $ruc);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $empresasApiKey],
]);
$response = curl_exec($ch);
// $response ya es el JSON: { data: [{ id, externalCustomerId, customerDisplayName,
//   invoiceNumber, amount, currency, status, paidAt, createdAt, ... }, ...] }
```

`externalCustomerId` es opcional — sin él trae **todas** las facturas (para una tabla general), con él trae solo las de un cliente puntual. `status` también se puede filtrar (`pending` o `paid`).

**Misma llave para las dos operaciones** (`EMPRESAS_API_KEY`) — es el mismo integrador, mandando y leyendo. Es una llave **distinta** de la `PORTAL_API_KEY` del portal cliente a propósito: si una se filtra, no compromete a la otra.

## Cómo correrlo

Primero tiene que estar levantado el stack de `virtualfact_chats` (`docker compose up -d` desde esa carpeta).

### Con Docker (recomendado)

Este servicio comparte `docker-compose.yml` con `portal-cliente-demo/` (dos carpetas arriba) — un solo `docker compose up` levanta los tres:

```
cd portal-cliente-demo
cp empresas/facturacion/.env.example empresas/facturacion/.env   # completar EMPRESAS_API_KEY
docker compose up -d --build
```

Adentro del contenedor corre Apache + PHP (`php:8.2-apache`), escuchando en el :80 interno, publicado en `:4001`.

Abrir `http://localhost:4001`. La sección 3 ("Facturas registradas") pulsa "Actualizar" para traer el registro real desde el Core API — así se ve exactamente lo que su propio backend tendría que pintar en su sistema.

## Referencia completa

Este README y `implementacion/ejemplo-backend-empresas.php` (dentro del repositorio `virtualfact_chats`) son la referencia completa de `/integration/invoices` -- son los únicos dos endpoints que necesita el sistema de facturación (`08-guia-integracion-portal.md` es solo para el portal cliente, no cubre facturas).
